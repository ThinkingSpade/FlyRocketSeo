import { describe, expect, it } from "vitest";
import {
  buildCannibalizationRows,
  buildLinkOpportunities,
} from "./linkInsights";

function row(
  query: string,
  page: string,
  clicks: number,
  impressions: number,
  position: number,
) {
  return { keys: [query, page], clicks, impressions, ctr: 0, position };
}

describe("buildLinkOpportunities", () => {
  it("suggests other ranking pages as sources for striking-distance targets", () => {
    const opportunities = buildLinkOpportunities([
      row("office coffee", "https://x.com/coffee/", 10, 500, 8),
      row("office coffee", "https://x.com/blog/a/", 1, 90, 25),
      row("office coffee", "https://x.com/blog/b/", 0, 40, 30),
    ]);

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].query).toBe("office coffee");
    expect(opportunities[0].target.page).toBe("https://x.com/coffee/");
    expect(opportunities[0].sources.map((s) => s.page)).toEqual([
      "https://x.com/blog/a/",
      "https://x.com/blog/b/",
    ]);
  });

  it("skips queries already ranking top-3 and queries with no other pages", () => {
    const opportunities = buildLinkOpportunities([
      // Best page is #2 — nothing to boost.
      row("won query", "https://x.com/win/", 50, 900, 2),
      row("won query", "https://x.com/other/", 1, 50, 15),
      // In band, but no second page exists to link from.
      row("lonely query", "https://x.com/solo/", 5, 300, 9),
    ]);
    expect(opportunities).toEqual([]);
  });

  it("sorts by target impressions", () => {
    const opportunities = buildLinkOpportunities([
      row("small", "https://x.com/s/", 1, 100, 10),
      row("small", "https://x.com/s2/", 0, 20, 40),
      row("big", "https://x.com/b/", 5, 5000, 12),
      row("big", "https://x.com/b2/", 0, 30, 33),
    ]);
    expect(opportunities.map((o) => o.query)).toEqual(["big", "small"]);
  });
});

describe("buildCannibalizationRows", () => {
  it("flags queries where two pages hold meaningful impression share", () => {
    const rows = buildCannibalizationRows([
      row("vending dallas", "https://x.com/a/", 20, 600, 6),
      row("vending dallas", "https://x.com/b/", 5, 400, 9),
      // Noise page: below the 10% share floor.
      row("vending dallas", "https://x.com/c/", 0, 30, 60),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].pages).toHaveLength(2);
    expect(rows[0].pages[0]).toMatchObject({
      page: "https://x.com/a/",
      isWinner: true,
    });
    expect(rows[0].pages[1]).toMatchObject({
      page: "https://x.com/b/",
      isWinner: false,
    });
    expect(rows[0].totalImpressions).toBe(1030);
  });

  it("ignores single-page queries and tiny impression counts", () => {
    const rows = buildCannibalizationRows([
      row("solo", "https://x.com/a/", 10, 500, 4),
      row("tiny", "https://x.com/a/", 0, 4, 12),
      row("tiny", "https://x.com/b/", 0, 4, 15),
    ]);
    expect(rows).toEqual([]);
  });
});
