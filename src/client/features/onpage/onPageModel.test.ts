import { describe, expect, it } from "vitest";
import {
  aiRewritableIds,
  clicksByPage,
  describeEmptyFixes,
  elementProgress,
  focusFirst,
  groupByPage,
  offOfferSuggestions,
  pageTrafficKey,
  pendingIds,
  summarize,
  toPath,
  type FixRow,
} from "./onPageModel";

function fix(overrides: Partial<FixRow> = {}): FixRow {
  return {
    id: "1",
    url: "https://x.com/a",
    element: "title",
    target: "",
    currentValue: "Old",
    suggestedValue: "New",
    reason: "because",
    source: "rules",
    status: "pending",
    ...overrides,
  };
}

describe("toPath", () => {
  it("strips the domain", () => {
    expect(toPath("https://x.com/blog/post?ref=1")).toBe("/blog/post?ref=1");
  });
  it("passes through non-URLs", () => {
    expect(toPath("/already/a/path")).toBe("/already/a/path");
  });
});

describe("elementProgress", () => {
  it("counts per element in display order, omitting empty ones", () => {
    const progress = elementProgress([
      fix({ id: "1", element: "title", status: "approved" }),
      fix({ id: "2", element: "title", status: "pending" }),
      fix({ id: "3", element: "alt", status: "excluded" }),
    ]);
    expect(progress.map((p) => p.element)).toEqual(["title", "alt"]);
    const titles = progress.find((p) => p.element === "title");
    expect(titles).toMatchObject({ total: 2, approved: 1, pending: 1 });
  });
});

describe("summarize", () => {
  it("computes completion over actionable (non-excluded) rows", () => {
    const summary = summarize([
      fix({ id: "1", status: "approved" }),
      fix({ id: "2", status: "approved" }),
      fix({ id: "3", status: "pending" }),
      fix({ id: "4", status: "excluded" }),
    ]);
    expect(summary).toMatchObject({
      total: 4,
      approved: 2,
      pending: 1,
      excluded: 1,
    });
    // 2 approved of 3 actionable.
    expect(summary.completion).toBeCloseTo(2 / 3);
  });

  it("is 0% completion with nothing approved and safe when all excluded", () => {
    expect(summarize([fix({ status: "pending" })]).completion).toBe(0);
    expect(summarize([fix({ status: "excluded" })]).completion).toBe(0);
    expect(summarize([]).completion).toBe(0);
  });
});

describe("groupByPage", () => {
  const rows = [
    fix({
      id: "a1",
      url: "https://x.com/a",
      element: "title",
      status: "pending",
    }),
    fix({
      id: "a2",
      url: "https://x.com/a",
      element: "alt",
      status: "pending",
    }),
    fix({
      id: "b1",
      url: "https://x.com/b",
      element: "meta",
      status: "approved",
    }),
  ];

  it("groups by url and falls back to pending count with no traffic data", () => {
    const groups = groupByPage(rows);
    expect(groups.map((g) => g.path)).toEqual(["/a", "/b"]);
    expect(groups[0].pendingIds).toEqual(["a1", "a2"]);
    expect(groups[0].clicks).toBeNull();
  });

  it("leads with the page that earns clicks, not the one with the most work left", () => {
    const clicks = new Map([["/b", 900]]);
    const groups = groupByPage(rows, "all", clicks);
    expect(groups.map((g) => g.path)).toEqual(["/b", "/a"]);
    expect(groups[0].clicks).toBe(900);
  });

  it("still breaks ties on remaining work when two pages earn the same", () => {
    const clicks = new Map([
      ["/a", 10],
      ["/b", 10],
    ]);
    const groups = groupByPage(rows, "all", clicks);
    expect(groups.map((g) => g.path)).toEqual(["/a", "/b"]);
  });

  it("does not sink a page with no Search Console row below a zero-click one", () => {
    const clicks = new Map([["/b", 0]]);
    const groups = groupByPage(rows, "all", clicks);
    // /a is unknown, /b is a known zero: neither is evidence of value, so the
    // pending-count tie-break decides and /a (two pending) still leads.
    expect(groups.map((g) => g.path)).toEqual(["/a", "/b"]);
  });

  it("orders rows within a page by element", () => {
    const groups = groupByPage(rows);
    expect(groups[0].rows.map((r) => r.element)).toEqual(["title", "alt"]);
  });

  it("filters by status when asked", () => {
    const groups = groupByPage(rows, "approved");
    expect(groups).toHaveLength(1);
    expect(groups[0].path).toBe("/b");
    expect(groups[0].pendingIds).toEqual([]);
  });
});

describe("focusFirst", () => {
  // The order groupByPage hands over: /b earns the clicks, /a does not.
  const groups = [
    { url: "https://x.com/b" },
    { url: "https://x.com/a" },
    { url: "https://x.com/c" },
  ];

  it("leads with the page an inbound link asked about", () => {
    expect(focusFirst(groups, "https://x.com/a").map((g) => g.url)).toEqual([
      "https://x.com/a",
      "https://x.com/b",
      "https://x.com/c",
    ]);
  });

  it("matches a Search Console page URL against the crawled one", () => {
    // What `?u=` actually carries: GSC reports the canonical property URL, so
    // the scheme, host case, www prefix and trailing slash can all differ from
    // the crawled URL. A raw `===` matched none of these and the handoff from
    // the CTR table silently did nothing.
    for (const focus of [
      "https://www.x.com/a",
      "http://x.com/a/",
      "https://X.com/A",
    ]) {
      expect(focusFirst(groups, focus)[0].url).toBe("https://x.com/a");
    }
  });

  it("keeps the traffic order underneath it", () => {
    expect(focusFirst(groups, "https://x.com/c").map((g) => g.url)).toEqual([
      "https://x.com/c",
      "https://x.com/b",
      "https://x.com/a",
    ]);
  });

  it("changes nothing without a focus, or when the page has no fixes", () => {
    expect(focusFirst(groups, null)).toEqual(groups);
    expect(focusFirst(groups, "")).toEqual(groups);
    expect(
      focusFirst(groups, "https://x.com/absent").map((g) => g.url),
    ).toEqual(groups.map((g) => g.url));
  });

  it("sorts, never filters -- the other pages are the context", () => {
    expect(focusFirst(groups, "https://x.com/a")).toHaveLength(groups.length);
  });
});

describe("pageTrafficKey", () => {
  it("matches a crawled URL to the Search Console row for the same page", () => {
    expect(pageTrafficKey("https://www.X.com/Blog/")).toBe(
      pageTrafficKey("http://x.com/blog"),
    );
  });

  it("keeps the root path", () => {
    expect(pageTrafficKey("https://x.com/")).toBe("/");
  });

  it("keeps distinct pages distinct", () => {
    expect(pageTrafficKey("https://x.com/a")).not.toBe(
      pageTrafficKey("https://x.com/b"),
    );
  });
});

describe("clicksByPage", () => {
  it("sums the query rows Search Console reports per page", () => {
    const totals = clicksByPage([
      { page: "https://x.com/a", clicks: 3 },
      { page: "https://x.com/a/", clicks: 4 },
      { page: "https://x.com/b", clicks: 1 },
    ]);
    expect(totals.get("/a")).toBe(7);
    expect(totals.get("/b")).toBe(1);
  });

  it("is empty when Search Console has nothing to say", () => {
    expect(clicksByPage([]).size).toBe(0);
  });
});

describe("offOfferSuggestions", () => {
  const profile = {
    offer: "We place and service vending machines for offices",
    exclusions: "We don't sell machines",
  };

  it("flags a suggested title that advertises something they do not do", () => {
    const flagged = offOfferSuggestions(
      [
        fix({
          id: "bad",
          element: "title",
          suggestedValue: "Buy Vending Machines in Dallas | Delio",
        }),
      ],
      profile,
    );
    expect(flagged.get("bad")).toContain("We don't sell machines");
  });

  it("leaves a suggestion that matches the offer alone", () => {
    const flagged = offOfferSuggestions(
      [
        fix({
          id: "ok",
          element: "title",
          suggestedValue: "Office Vending Machine Service in Dallas | Delio",
        }),
      ],
      profile,
    );
    expect(flagged.size).toBe(0);
  });

  it("says nothing at all when the profile is empty", () => {
    const flagged = offOfferSuggestions(
      [
        fix({
          id: "bad",
          element: "title",
          suggestedValue: "Buy Vending Machines in Dallas",
        }),
      ],
      { offer: "", exclusions: "" },
    );
    expect(flagged.size).toBe(0);
  });

  it("ignores alt text, which describes an image rather than the business", () => {
    const flagged = offOfferSuggestions(
      [
        fix({
          id: "alt",
          element: "alt",
          suggestedValue: "Buy vending machines",
        }),
      ],
      profile,
    );
    expect(flagged.size).toBe(0);
  });
});

describe("id selectors", () => {
  const rows = [
    fix({ id: "t", element: "title", status: "pending" }),
    fix({ id: "m", element: "meta", status: "pending" }),
    fix({ id: "h", element: "h1", status: "pending" }),
    fix({ id: "a", element: "alt", status: "pending" }),
    fix({ id: "done", element: "title", status: "approved" }),
  ];

  it("pendingIds returns every pending row", () => {
    expect(pendingIds(rows).toSorted()).toEqual(["a", "h", "m", "t"]);
  });

  it("aiRewritableIds returns only pending title/meta", () => {
    expect(aiRewritableIds(rows).toSorted()).toEqual(["m", "t"]);
  });
});

describe("describeEmptyFixes", () => {
  it("never calls a crawl with nothing serving a clean audit", () => {
    const copy = describeEmptyFixes({ pagesAnalyzed: 0, pagesSkipped: 12 });
    expect(copy.title).toBe("No pages could be analyzed");
    expect(copy.body).toContain("12 pages");
    expect(copy.body).toContain("not a clean bill of health");
    // The claim the old copy made in this exact state: that the audit was
    // analyzed and simply found nothing wrong.
    expect(copy.body).not.toMatch(/analyzed successfully/i);
    expect(copy.body).not.toMatch(/no title, meta, heading, or alt-text/i);
    // It names what to run next instead of implying a finding.
    expect(copy.body).toMatch(/re-run the site audit/i);
  });

  it("blames only what the counts support", () => {
    const copy = describeEmptyFixes({ pagesAnalyzed: 0, pagesSkipped: 1 });
    // `pagesSkipped` says the page returned no 2xx. It does not say the page
    // 404'd, that the site is offline, or that anything is broken.
    expect(copy.body).toContain("1 page");
    expect(copy.body).toContain("2xx");
    expect(copy.body).not.toMatch(/404|offline|broken|down|dead/i);
  });

  it("distinguishes a crawl that recorded no pages at all", () => {
    const copy = describeEmptyFixes({ pagesAnalyzed: 0, pagesSkipped: 0 });
    expect(copy.title).toBe("No pages to analyze");
    expect(copy.body).toContain("no crawled pages");
    expect(copy.body).toContain("not a clean bill of health");
  });

  it("only reports no fixes found when pages were actually analyzed", () => {
    const copy = describeEmptyFixes({ pagesAnalyzed: 18, pagesSkipped: 0 });
    expect(copy.title).toBe("No fixes found");
    expect(copy.body).toContain("18 pages");
    expect(copy.body).toContain("no title, meta, heading, or alt-text fixes");
    // The Search Console caveat is still part of an honest "no fixes" answer.
    expect(copy.body).toMatch(/Search Console/);
    expect(copy.body).not.toContain("2xx");
  });

  it("admits the pages it could not read alongside a real finding", () => {
    const copy = describeEmptyFixes({ pagesAnalyzed: 18, pagesSkipped: 4 });
    expect(copy.title).toBe("No fixes found");
    expect(copy.body).toContain("18 pages");
    expect(copy.body).toContain("4 pages did not return a 2xx response");
  });
});
