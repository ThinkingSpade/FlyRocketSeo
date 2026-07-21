import { describe, expect, it } from "vitest";
import {
  selectOpportunities,
  selectRankingNow,
  summarizeProjectKeywords,
} from "./projectKeywords";

function q(query: string, position: number, clicks = 0, impressions = 0) {
  return { query, position, clicks, impressions };
}

describe("summarizeProjectKeywords", () => {
  it("counts ranking, top-3, top-10 and close-to-page-one buckets", () => {
    const summary = summarizeProjectKeywords([
      q("a", 1),
      q("b", 3),
      q("c", 8),
      q("d", 14),
      q("e", 20),
      q("f", 45),
    ]);

    expect(summary).toEqual({
      ranking: 6,
      top3: 2,
      top10: 3,
      // Positions 8, 14 and 20 fall in the 4–20 opportunity band.
      closeToPageOne: 3,
    });
  });

  it("handles an empty query set", () => {
    expect(summarizeProjectKeywords([])).toEqual({
      ranking: 0,
      top3: 0,
      top10: 0,
      closeToPageOne: 0,
    });
  });
});

describe("selectRankingNow", () => {
  it("leads with earners, then top-10 reach", () => {
    const rows = selectRankingNow([
      q("earner", 6, 12, 300),
      q("quiet top10", 4, 0, 500),
      q("deep no clicks", 60, 0, 900),
      q("small earner", 12, 3, 40),
    ]);

    expect(rows.map((row) => row.query)).toEqual([
      "earner",
      "small earner",
      "quiet top10",
    ]);
    // A deep, clickless query is neither a win nor worth showing here.
    expect(rows.some((row) => row.query === "deep no clicks")).toBe(false);
  });
});

describe("selectOpportunities", () => {
  it("returns positions 4-20 ranked by impressions", () => {
    const rows = selectOpportunities([
      q("winner", 2, 50, 5000),
      q("big chance", 11, 0, 800),
      q("small chance", 5, 1, 120),
      q("too deep", 33, 0, 9000),
    ]);

    expect(rows.map((row) => row.query)).toEqual([
      "big chance",
      "small chance",
    ]);
  });

  it("breaks impression ties by better position", () => {
    const rows = selectOpportunities([
      q("deeper", 18, 0, 100),
      q("nearer", 6, 0, 100),
    ]);
    expect(rows[0].query).toBe("nearer");
  });
});
