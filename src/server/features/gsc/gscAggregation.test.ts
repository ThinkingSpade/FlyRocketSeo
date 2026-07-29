import { describe, expect, it } from "vitest";
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";
import {
  attributePagesToQueries,
  buildPropertyQueryTotals,
  representativePageForQuery,
} from "@/server/features/gsc/gscAggregation";

function row(
  keys: string[],
  clicks: number,
  impressions: number,
  position: number,
): GscSearchAnalyticsRow {
  return {
    keys,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position,
  };
}

describe("buildPropertyQueryTotals", () => {
  it("takes each query row's own totals rather than summing page rows", () => {
    // Google counts a property ONCE per impression even when two of its URLs
    // appear in the same result set. Page-dimension rows count each displayed
    // URL, so summing them for the query total double-counts.
    const queryRows = [row(["widgets"], 3, 100, 4.2)];

    const totals = buildPropertyQueryTotals(queryRows);

    expect(totals).toEqual([
      {
        query: "widgets",
        clicks: 3,
        impressions: 100,
        ctr: 0.03,
        position: 4.2,
      },
    ]);
  });

  it("sorts by clicks then impressions, matching the previous implementation", () => {
    // Ordering is deliberately unchanged from the page-summing version it
    // replaces: this swap should move the numbers, not reshuffle the list.
    const totals = buildPropertyQueryTotals([
      row(["one-click-few"], 1, 10, 5),
      row(["two-clicks"], 2, 5, 8),
      row(["one-click-many"], 1, 900, 6),
    ]);

    expect(totals.map((t) => t.query)).toEqual([
      "two-clicks",
      "one-click-many",
      "one-click-few",
    ]);
  });

  it("caps the list at the requested limit", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row([`q${i}`], 30 - i, 100, 5),
    );

    expect(buildPropertyQueryTotals(rows, 10)).toHaveLength(10);
  });

  it("drops rows with no query key rather than inventing an empty query", () => {
    expect(buildPropertyQueryTotals([row([], 1, 10, 5)])).toEqual([]);
  });

  it("keeps the provider's position instead of recomputing it", () => {
    // Position arrives already averaged over impressions for the row. There is
    // no way to re-derive it, so it must be passed through untouched.
    const totals = buildPropertyQueryTotals([row(["q"], 0, 500, 7.83)]);
    expect(totals[0]?.position).toBe(7.83);
  });
});

describe("attributePagesToQueries", () => {
  it("expresses page shares relative to the query's own page rows", () => {
    const attribution = attributePagesToQueries([
      row(["widgets", "https://e.com/widgets"], 0, 100, 4),
      row(["widgets", "https://e.com/sale/widgets"], 0, 100, 9),
    ]);
    const pages = attribution.get("widgets") ?? [];

    expect(pages).toHaveLength(2);
    expect(pages[0]?.shareOfQueryPageImpressions).toBeCloseTo(0.5);
    expect(pages[1]?.shareOfQueryPageImpressions).toBeCloseTo(0.5);
  });

  it("orders a query's pages by impressions descending", () => {
    const attribution = attributePagesToQueries([
      row(["q", "/small"], 0, 10, 4),
      row(["q", "/big"], 0, 990, 9),
    ]);

    expect((attribution.get("q") ?? []).map((p) => p.page)).toEqual([
      "/big",
      "/small",
    ]);
  });

  it("ignores rows missing either key", () => {
    const attribution = attributePagesToQueries([
      row(["q"], 0, 10, 4),
      row([], 0, 10, 4),
    ]);

    expect(attribution.size).toBe(0);
  });

  it("does not divide by zero when a query has no impressions", () => {
    const attribution = attributePagesToQueries([row(["q", "/a"], 0, 0, 4)]);
    expect(attribution.get("q")?.[0]?.shareOfQueryPageImpressions).toBe(0);
  });
});

describe("representativePageForQuery", () => {
  it("does not let a one-impression page outrank the traffic-carrying page", () => {
    // The defect this replaces: MIN(page average position) made /a the site's
    // "best page" for the query, which hid a real striking-distance
    // opportunity on /b and pointed internal links at the wrong URL.
    const pages = attributePagesToQueries([
      row(["q", "/a"], 0, 1, 1),
      row(["q", "/b"], 20, 1000, 8),
    ]);

    const result = representativePageForQuery(pages.get("q") ?? []);

    expect(result.page).toBe("/b");
    expect(result.position).toBeCloseTo(8);
    expect(result.split).toBe(false);
  });

  it("reports a split when no page owns the query", () => {
    const pages = attributePagesToQueries([
      row(["q", "/a"], 10, 500, 6),
      row(["q", "/b"], 10, 500, 7),
    ]);

    const result = representativePageForQuery(pages.get("q") ?? []);

    expect(result.split).toBe(true);
  });

  it("does not call a single-page query a split", () => {
    const pages = attributePagesToQueries([row(["q", "/only"], 5, 300, 3)]);

    expect(representativePageForQuery(pages.get("q") ?? []).split).toBe(false);
  });

  it("returns an empty representation for no pages", () => {
    expect(representativePageForQuery([])).toEqual({
      page: "",
      position: 0,
      split: false,
    });
  });
});
