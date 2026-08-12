import { describe, expect, it, vi } from "vitest";
import { DIRECTORIES } from "@/shared/citations/directories";

/**
 * The chapter is printed and handed to a client, so the interesting assertion
 * is never "the chapter is missing" — it is which sentence the coverage list
 * gives as the reason. A restore that threw and a check that was never run are
 * two different accusations, and only one of them is about the agency.
 *
 * `usecitationsReportData` pulls in `restoreLatestRun`, whose server module
 * reaches `cloudflare:workers` through the R2 helper and cannot be imported in
 * a node test. Stubbing that one module boundary keeps this test on the pure
 * build function with hand-built data, and out of a React Query context.
 */
vi.mock("@/serverFunctions/analysisRuns", () => ({
  restoreLatestRun: () => Promise.resolve(null),
  restoreRun: () => Promise.resolve(null),
}));

const { buildcitationsChapter } =
  await import("@/client/features/report/chapters/citations");

const CHAPTER_TITLE = "Where your business shows up in directories";

type Collected = {
  pages: Array<{
    key: string;
    number: string;
    kicker: string;
    title: string;
    body: unknown;
  }>;
  omissions: Array<{ title: string; reason: string }>;
};

function collect(data: Parameters<typeof buildcitationsChapter>[0]): Collected {
  const out: Collected = { pages: [], omissions: [] };
  buildcitationsChapter(data, {
    add: (spec) => out.pages.push(spec),
    drop: (title, reason) => out.omissions.push({ title, reason }),
  });
  return out;
}

/**
 * Every string the chapter body would print, without a renderer.
 *
 * Walks the element tree's props rather than rendering, so the test needs no
 * DOM: what matters is that the model's own sentence and the provenance line
 * reach the sheet, not how they are laid out.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function printedText(node: unknown, depth = 0): string[] {
  if (depth > 24) return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [String(node)];
  if (Array.isArray(node))
    return node.flatMap((item) => printedText(item, depth + 1));
  if (!isRecord(node)) return [];
  // A React element: descend into its props and skip the internals.
  if (isRecord(node.props)) return printedText(node.props, depth + 1);
  return Object.values(node).flatMap((value) => printedText(value, depth + 1));
}

function sheet(page: { body: unknown }): string {
  return printedText(page.body).join(" ");
}

const CONFIRMED_LISTING = {
  domain: "yellowpages.com",
  url: "https://www.yellowpages.com/chicago-il/mip/joes-pizza-12345",
  title: "Joe's Pizza - Chicago, IL - Yellow Pages",
};

// The directory's own search page: the domain matched, so the directory
// appeared, but nothing corroborates that this is the business's own listing.
const DIRECTORY_SEARCH_PAGE = {
  domain: "yelp.com",
  url: "https://www.yelp.com/search?find_desc=Joe%27s+Pizza",
  title: "Best Pizza in Chicago - Yelp",
};

function filler(index: number) {
  return {
    domain: "example-blog.test",
    url: `https://example-blog.test/post-${index}`,
    title: `Chicago food writing ${index}`,
  };
}

function run(
  overrides: Partial<{
    query: string;
    businessName: string;
    city: string | null;
    phone: string | null;
    results: Array<{
      domain: string | null;
      url: string | null;
      title: string | null;
    }>;
    fetchedAt: string;
  }> = {},
) {
  return {
    query: "Joe's Pizza Chicago",
    businessName: "Joe's Pizza",
    city: "Chicago, IL",
    phone: "+1 312 555 0100",
    locationCode: 2840,
    languageCode: "en",
    fetchedAt: "2026-06-14T09:31:00.000Z",
    results: [CONFIRMED_LISTING, DIRECTORY_SEARCH_PAGE, filler(1), filler(2)],
    ...overrides,
  };
}

describe("buildcitationsChapter, when a run restored", () => {
  it("adds the chapter", () => {
    const out = collect({ citations: run(), citationsGap: null });

    expect(out.omissions).toEqual([]);
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].key).toBe("citations");
    expect(out.pages[0].title).toBe(CHAPTER_TITLE);
  });

  it("prints the band number that belongs to Local presence", () => {
    // The band prints number and kicker together on every sheet, and the
    // pairing is 1:1: 06 is "Local presence" (localSeo.tsx owns the other half
    // of it), 07 is "Next steps". Reusing another band's number splits one
    // kicker across two numbers in the same PDF.
    const page = collect({ citations: run(), citationsGap: null }).pages[0];

    expect(page.kicker).toBe("Local presence");
    expect(page.number).toBe("06");
    expect(page.number).not.toBe("07");
  });

  it("counts confirmed listings against the real directory list", () => {
    // Never a hardcoded denominator: the list has grown before, and a stale
    // "of 16" in a client PDF is a wrong figure at 40pt type.
    const text = sheet(
      collect({ citations: run(), citationsGap: null }).pages[0],
    );

    expect(text).toContain(`1 of ${DIRECTORIES.length}`);
    expect(text).toContain("Confirmed listings");
    expect(text).toContain("Also appeared");
  });

  it("separates confirmed, unconfirmed and absent in the table", () => {
    const text = sheet(
      collect({ citations: run(), citationsGap: null }).pages[0],
    );

    expect(text).toContain("Yellow Pages");
    expect(text).toContain("Confirmed listing");
    // The domain matched on Yelp's own search page, which is not this
    // business's listing and must not be printed as one.
    expect(text).toContain("Yelp");
    expect(text).toContain("Appeared, not confirmed");
    expect(text).toContain("Didn't surface");
  });

  it("prints the query, the business, the city and the date", () => {
    // The only defence against a stale run, or a multi-location client's other
    // branch, printing as current fact about the reader's business.
    const text = sheet(
      collect({ citations: run(), citationsGap: null }).pages[0],
    );

    expect(text).toContain('Searched "Joe\'s Pizza Chicago"');
    expect(text).toContain("Joe's Pizza, Chicago, IL");
    // Written the way a person writes a date, in the reader's own timezone —
    // never the raw stored instant, and never its UTC calendar day, which for
    // an evening run prints as tomorrow and reads as later than the report's
    // own "Generated" foot.
    expect(text).toContain("as of June 14, 2026");
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // No period-over-period claim is available for this chapter, ever.
    expect(text).not.toContain("this period");
    expect(text).not.toContain("this month");
  });

  it("never draws an absence claim the model refused to make", () => {
    // Thin sample: the model returns `missing` empty on purpose. A table built
    // off DIRECTORIES would stamp "Didn't surface" on every row instead.
    const thin = run({ results: [CONFIRMED_LISTING] });
    const text = sheet(
      collect({ citations: thin, citationsGap: null }).pages[0],
    );

    expect(text).toContain("Yellow Pages");
    expect(text).not.toContain("Didn't surface");
  });

  it("prints no whole-list claim when the model would not judge coverage", () => {
    // The hero used to print "1 of 19" in 40pt directly above the model's own
    // "too few to judge citation coverage one way or the other" — a claim
    // about 18 directories that the sentence below it explicitly refuses to
    // make, over a table listing exactly one row. And "Directories checked"
    // over that one row implies the other 18 were checked and came back clean.
    const out = collect({
      citations: run({ results: [CONFIRMED_LISTING] }),
      citationsGap: null,
    });
    // A confirmed match is real evidence even in a thin sample, so the sheet
    // still earns its place; only the absence claim is withheld.
    expect(out.omissions).toEqual([]);
    const text = sheet(out.pages[0]);

    expect(text).toContain("Confirmed in this search");
    expect(text).toContain(
      "too few to judge citation coverage one way or the other",
    );
    expect(text).toContain("What this search turned up");
    expect(text).toContain(
      `Only the directories that appeared are listed; the other ${DIRECTORIES.length - 1} on this list could not be judged from a search this thin.`,
    );
    expect(text).not.toContain(`of ${DIRECTORIES.length}`);
    expect(text).not.toContain("Confirmed listings");
    expect(text).not.toContain("Directories checked");
  });

  it("keeps the full-list denominator when the model did judge coverage", () => {
    const text = sheet(
      collect({ citations: run(), citationsGap: null }).pages[0],
    );

    expect(text).toContain("Directories checked");
    expect(text).not.toContain("could not be judged from a search this thin");
  });
});

describe("buildcitationsChapter, when the search confirmed nothing", () => {
  it("keeps its sheet and prints the model's own reading", () => {
    // "None of them surfaced" is a finding, not an absence, so it earns a page.
    const empty = run({
      results: [filler(1), filler(2), filler(3), filler(4)],
    });
    const out = collect({ citations: empty, citationsGap: null });

    expect(out.omissions).toEqual([]);
    expect(out.pages).toHaveLength(1);

    const text = sheet(out.pages[0]);
    expect(text).toContain("0 of");
    expect(text).toContain(
      "that's not evidence the listings don't exist, only that none were confirmed in this search",
    );
    expect(text).toContain(
      "A listing may well exist already; worth checking by hand before creating anything new.",
    );
  });
});

describe("buildcitationsChapter, when the search found nothing to report", () => {
  it("drops rather than print a 40pt zero over an empty table", () => {
    // A 0-result run is cached and recorded like any other, so it restores as
    // ready. The sheet was "0 of 19" above "Also appeared 0" above a table with
    // no rows — read as "your business is in none of these directories", which
    // is precisely what a search returning nothing cannot establish.
    const out = collect({
      citations: run({ results: [] }),
      citationsGap: null,
    });

    expect(out.pages).toEqual([]);
    expect(out.omissions).toEqual([
      {
        title: CHAPTER_TITLE,
        reason:
          "The saved citation check came back with no search results at all, so it neither confirmed nor ruled out a single directory. Re-running it from the Local SEO tab is what would fill this section in.",
      },
    ]);
    expect(out.omissions[0].reason).not.toContain("0 of");
    expect(out.omissions[0].reason).not.toContain("has been saved");
  });

  it("names the thin result count when no directory surfaced at all", () => {
    // Two results, neither a directory: too thin to judge coverage, and
    // nothing found either, so there is no row and no honest headline.
    const out = collect({
      citations: run({ results: [filler(1), filler(2)] }),
      citationsGap: null,
    });

    expect(out.pages).toEqual([]);
    expect(out.omissions[0].reason).toBe(
      "The saved citation check came back with only 2 search results — too few to judge directory coverage from, and none of them was a directory on this report's list. Re-running it from the Local SEO tab is what would fill this section in.",
    );
  });
});

describe("buildcitationsChapter, when there is nothing to print", () => {
  it("drops a run it cannot date rather than print it as current", () => {
    const out = collect({
      citations: run({ fetchedAt: "not-an-instant" }),
      citationsGap: null,
    });

    expect(out.pages).toEqual([]);
    expect(out.omissions).toEqual([
      {
        title: CHAPTER_TITLE,
        reason:
          "The saved citation check carries no readable date, so this report cannot confirm when it was made or whether it still describes today's search results.",
      },
    ]);
    expect(out.omissions[0].reason).not.toContain("has been saved");
  });

  it("says the read failed when the restore threw", () => {
    // The defect this whole effort exists to fix: a request that failed used to
    // print as "no citation check has been saved", blaming the agency.
    const out = collect({
      citations: null,
      citationsGap:
        "The saved citation check could not be read while this report was generated — that request failed rather than returning nothing.",
    });

    expect(out.pages).toEqual([]);
    expect(out.omissions).toEqual([
      {
        title: CHAPTER_TITLE,
        reason:
          "The saved citation check could not be read while this report was generated — that request failed rather than returning nothing.",
      },
    ]);
    expect(out.omissions[0].reason).not.toContain("has been saved");
  });

  it("says where the button lives when nothing was ever run", () => {
    const out = collect({ citations: null, citationsGap: null });

    expect(out.pages).toEqual([]);
    expect(out.omissions).toEqual([
      {
        title: CHAPTER_TITLE,
        reason:
          "No citation check has been saved for this project. It is a metered search run from the Local SEO tab, not part of the monthly crawl.",
      },
    ]);
  });

  it("names the omission what the chapter is called, not what the coverage list calls it", () => {
    // "Citations" is the not-covered entry, and that block says of its entries
    // "the report has no chapter for them yet" — directly under an omission
    // block promising that running the named analysis adds it next time. Same
    // word, two contradictory promises, on one page.
    const out = collect({ citations: null, citationsGap: null });

    expect(out.omissions[0].title).toBe(CHAPTER_TITLE);
    expect(out.omissions[0].title).not.toBe("Citations");
    // The client reads the omission line and the chapter heading as the same
    // section, so the two strings have to match.
    expect(
      collect({ citations: run(), citationsGap: null }).pages[0].title,
    ).toBe(out.omissions[0].title);
  });

  it("keeps expiry distinct from never having run", () => {
    // Pre-fix runs fall back to a bucket prefix Cloudflare deletes at 7 days,
    // so expired is a common state here rather than an exotic one.
    const out = collect({
      citations: null,
      citationsGap:
        "The saved citation check has expired — stored results are kept for a limited window — so it could not be included here. Re-running it restores this section.",
    });

    expect(out.omissions[0].reason).toContain("has expired");
    expect(out.omissions[0].reason).not.toContain("Local SEO tab");
  });
});
