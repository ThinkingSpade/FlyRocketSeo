import { describe, expect, it } from "vitest";
import {
  buildCtrOpportunityRows,
  buildStrikingDistanceRows,
  previousPeriod,
  sumSearchTotals,
  toDimensionRows,
} from "@/server/features/gsc/searchPerformanceReport";

describe("sumSearchTotals", () => {
  it("sums clicks/impressions and impression-weights position", () => {
    const totals = sumSearchTotals([
      { clicks: 10, impressions: 100, ctr: 0.1, position: 2 },
      { clicks: 5, impressions: 300, ctr: 0.016, position: 10 },
    ]);
    expect(totals.clicks).toBe(15);
    expect(totals.impressions).toBe(400);
    expect(totals.ctr).toBeCloseTo(15 / 400);
    // (2*100 + 10*300) / 400 = 8
    expect(totals.position).toBeCloseTo(8);
  });

  it("returns zeros for no rows instead of NaN", () => {
    expect(sumSearchTotals([])).toEqual({
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
    });
  });
});

describe("toDimensionRows", () => {
  it("keeps the first key and drops keyless rows", () => {
    const rows = toDimensionRows([
      {
        keys: ["magento agency"],
        clicks: 3,
        impressions: 40,
        ctr: 0.075,
        position: 6.2,
      },
      { clicks: 1, impressions: 5, ctr: 0.2, position: 1 },
    ]);
    expect(rows).toEqual([
      {
        key: "magento agency",
        clicks: 3,
        impressions: 40,
        ctr: 0.075,
        position: 6.2,
      },
    ]);
  });
});

const row = (query: string, position: number, impressions: number) => ({
  keys: [query, `https://example.com/${query}`],
  clicks: 1,
  impressions,
  ctr: 0.01,
  position,
});

// Same query can map to multiple pages; this lets a test set distinct pages.
const pageRow = (
  query: string,
  page: string,
  position: number,
  impressions: number,
) => ({ keys: [query, page], clicks: 1, impressions, ctr: 0.01, position });

describe("buildStrikingDistanceRows", () => {
  it("keeps only positions 5..20 and sorts by impressions desc", () => {
    const rows = buildStrikingDistanceRows([
      row("top-spot", 2, 900),
      row("close", 6.4, 100),
      row("closer", 11, 400),
      row("page-3", 24, 800),
    ]);
    expect(rows.map((r) => r.query)).toEqual(["closer", "close"]);
  });

  it("includes the boundary positions and respects the limit", () => {
    const rows = buildStrikingDistanceRows(
      [row("low-edge", 5, 10), row("high-edge", 20, 20)],
      1,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].query).toBe("high-edge");
  });

  it("drops rows without both query and page keys", () => {
    const rows = buildStrikingDistanceRows([
      {
        keys: ["only-query"],
        clicks: 1,
        impressions: 50,
        ctr: 0.02,
        position: 8,
      },
    ]);
    expect(rows).toHaveLength(0);
  });

  it("drops a query whose top page already ranks above the band", () => {
    // flyrocketseo: homepage ranks #2, a secondary page ranks #6. The site already
    // ranks near the top, so the query is not a striking-distance opportunity.
    const rows = buildStrikingDistanceRows([
      pageRow("flyrocketseo", "https://x.com/home", 2, 900),
      pageRow("flyrocketseo", "https://x.com/mcp", 6, 300),
    ]);
    expect(rows).toHaveLength(0);
  });

  it("collapses a query to the page carrying its impressions", () => {
    const rows = buildStrikingDistanceRows([
      pageRow("kw", "https://x.com/a", 14, 100),
      pageRow("kw", "https://x.com/b", 8, 500),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].page).toBe("https://x.com/b");
    expect(rows[0].position).toBe(8);
  });

  it("does not let a one-impression page hide the opportunity on the page that gets seen", () => {
    // The distinguishing case for impression-weighted representation, which the
    // other cases in this suite cannot detect because their position-leader and
    // impression-leader happen to be the same page.
    //
    // /fluke averages position 2.0 off a single impression; /real averages 8.0
    // off a thousand. Taking MIN(position) judged the site already-ranking and
    // dropped the query entirely, hiding a genuine striking-distance
    // opportunity on the only page anyone actually sees.
    const rows = buildStrikingDistanceRows([
      pageRow("kw", "https://x.com/fluke", 2, 1),
      pageRow("kw", "https://x.com/real", 8, 1000),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].page).toBe("https://x.com/real");
    expect(rows[0].position).toBe(8);
    expect(rows[0].impressions).toBe(1000);
  });

  it("keeps a substantial in-band page even when a bigger page ranks far worse", () => {
    // Adversarial review caught this as a regression I introduced. Collapsing
    // each query to its impression LEADER before applying the band check threw
    // away real work: /coffee holds 40% of the query's impressions at position
    // 8 -- squarely a striking-distance opportunity -- but /blog is larger and
    // ranks 35th, so the query was dropped entirely.
    //
    // Filtering out noise pages and THEN looking for an in-band candidate closes
    // both failure modes at once.
    const rows = buildStrikingDistanceRows([
      pageRow("commercial coffee", "https://x.com/blog", 35, 600),
      pageRow("commercial coffee", "https://x.com/coffee", 8, 400),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].page).toBe("https://x.com/coffee");
    expect(rows[0].position).toBe(8);
  });

  it("still drops a query the leading page already ranks near the top for", () => {
    // Ownership decides which page represents the query; the band filter then
    // applies to THAT page. A query whose traffic-carrying page ranks #2 is not
    // a striking-distance opportunity.
    const rows = buildStrikingDistanceRows([
      pageRow("kw", "https://x.com/home", 2, 900),
      pageRow("kw", "https://x.com/secondary", 8, 10),
    ]);

    expect(rows).toHaveLength(0);
  });
});

describe("previousPeriod", () => {
  it("returns the same-length window ending the day before the start", () => {
    expect(previousPeriod("2026-06-01", "2026-06-28")).toEqual({
      startDate: "2026-05-04",
      endDate: "2026-05-31",
    });
  });

  it("handles a single-day range", () => {
    expect(previousPeriod("2026-06-10", "2026-06-10")).toEqual({
      startDate: "2026-06-09",
      endDate: "2026-06-09",
    });
  });
});

describe("buildCtrOpportunityRows", () => {
  it("flags well-ranking rows clicked far below benchmark, sized by missed clicks", () => {
    const rows = buildCtrOpportunityRows([
      // Position 2 with 1% CTR on 1000 impressions: big miss.
      {
        keys: ["big miss", "https://x/a"],
        clicks: 10,
        impressions: 1000,
        ctr: 0.01,
        position: 2,
      },
      // Healthy CTR for its position: not flagged.
      {
        keys: ["healthy", "https://x/b"],
        clicks: 120,
        impressions: 1000,
        ctr: 0.12,
        position: 2,
      },
      // Too few impressions: ignored.
      {
        keys: ["tiny", "https://x/c"],
        clicks: 0,
        impressions: 20,
        ctr: 0,
        position: 1,
      },
      // Ranks too deep: ignored.
      {
        keys: ["deep", "https://x/d"],
        clicks: 0,
        impressions: 500,
        ctr: 0,
        position: 30,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].query).toBe("big miss");
    expect(rows[0].missedClicks).toBe(140);
  });
});
