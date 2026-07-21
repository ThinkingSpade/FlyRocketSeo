import { describe, expect, it } from "vitest";
import {
  bucketDeltas,
  buildContentGroups,
  buildPageBuckets,
  buildTopMovers,
  classifyContentGroup,
} from "./contentGroups";

function page(url: string, clicks = 0, impressions = 0, position = 50) {
  return { page: url, clicks, impressions, position };
}

describe("classifyContentGroup", () => {
  it("recognises the homepage", () => {
    expect(classifyContentGroup("https://x.com")).toBe("homepage");
    expect(classifyContentGroup("https://x.com/")).toBe("homepage");
  });

  it("classifies by path segment", () => {
    expect(classifyContentGroup("https://x.com/blog/a-post")).toBe("blog");
    expect(classifyContentGroup("https://x.com/guides/how-to")).toBe("guides");
    expect(classifyContentGroup("https://x.com/category/snacks")).toBe(
      "category",
    );
    expect(classifyContentGroup("https://x.com/products/vending")).toBe(
      "product",
    );
    expect(classifyContentGroup("https://x.com/promotions/spring")).toBe(
      "events",
    );
    expect(classifyContentGroup("https://x.com/about-us")).toBe("about");
  });

  it("prefers the more specific blog rule over guides", () => {
    // A how-to living under /blog/ is still a blog post.
    expect(classifyContentGroup("https://x.com/blog/how-to-brew")).toBe("blog");
  });

  it("falls back to other, and tolerates non-URL input", () => {
    expect(classifyContentGroup("https://x.com/random-page")).toBe("other");
    expect(classifyContentGroup("/blog/relative")).toBe("blog");
  });
});

describe("buildContentGroups", () => {
  it("aggregates per group and compares with the previous period", () => {
    const rows = buildContentGroups(
      [
        page("https://x.com/blog/a", 30, 300),
        page("https://x.com/blog/b", 20, 200),
        page("https://x.com/", 10, 100),
      ],
      [page("https://x.com/blog/a", 25, 400), page("https://x.com/", 20, 100)],
    );

    const blog = rows.find((row) => row.key === "blog");
    expect(blog).toMatchObject({
      label: "Blog Posts",
      clicks: 50,
      impressions: 500,
      pageCount: 2,
    });
    // Clicks 25 -> 50 is +100%; impressions 400 -> 500 is +25%.
    expect(blog?.clicksDelta).toBeCloseTo(100);
    expect(blog?.impressionsDelta).toBeCloseTo(25);

    // Homepage clicks halved.
    const homepage = rows.find((row) => row.key === "homepage");
    expect(homepage?.clicksDelta).toBeCloseTo(-50);
  });

  it("treats brand-new groups as +100% rather than dividing by zero", () => {
    const rows = buildContentGroups([page("https://x.com/blog/a", 5, 50)], []);
    expect(rows[0].clicksDelta).toBe(100);
  });

  it("omits groups with no traffic at all", () => {
    expect(
      buildContentGroups([page("https://x.com/blog/a", 0, 0)], []),
    ).toEqual([]);
  });
});

describe("buildPageBuckets", () => {
  it("counts pages by position band", () => {
    const buckets = buildPageBuckets([
      page("https://x.com/a", 0, 0, 1),
      page("https://x.com/b", 0, 0, 3),
      page("https://x.com/c", 0, 0, 7),
      page("https://x.com/d", 0, 0, 20),
      page("https://x.com/e", 0, 0, 60),
      page("https://x.com/f", 0, 0, 140),
    ]);
    expect(buckets).toEqual({
      top3: 2,
      top4to10: 1,
      top11to25: 1,
      top26to100: 1,
    });
  });
});

describe("buildTopMovers", () => {
  const current = [
    page("https://x.com/a", 30, 300),
    page("https://x.com/b", 12, 200),
    page("https://x.com/c", 5, 100),
    page("https://x.com/new", 8, 80),
  ];
  const previous = [
    page("https://x.com/a", 10, 250),
    page("https://x.com/b", 12, 180),
    page("https://x.com/c", 20, 400),
  ];

  it("ranks pages by clicks gained, biggest first", () => {
    const movers = buildTopMovers(current, previous);
    expect(movers.map((row) => row.page)).toEqual([
      "https://x.com/a",
      "https://x.com/new",
    ]);
    expect(movers[0].clicksDelta).toBe(20);
  });

  it("counts a brand-new page's whole click total as its gain", () => {
    const movers = buildTopMovers(current, previous);
    expect(movers.find((row) => row.page.endsWith("/new"))?.clicksDelta).toBe(8);
  });

  it("drops flat and declining pages", () => {
    const pages = buildTopMovers(current, previous).map((row) => row.page);
    // /b was flat, /c declined.
    expect(pages).not.toContain("https://x.com/b");
    expect(pages).not.toContain("https://x.com/c");
  });

  it("respects the limit", () => {
    expect(buildTopMovers(current, previous, 1)).toHaveLength(1);
  });
});

describe("bucketDeltas", () => {
  it("computes per-bucket percent change", () => {
    const deltas = bucketDeltas(
      { top3: 12, top4to10: 10, top11to25: 5, top26to100: 0 },
      { top3: 10, top4to10: 20, top11to25: 0, top26to100: 0 },
    );
    expect(deltas.top3).toBeCloseTo(20);
    expect(deltas.top4to10).toBeCloseTo(-50);
    expect(deltas.top11to25).toBe(100);
    expect(deltas.top26to100).toBeNull();
  });
});
