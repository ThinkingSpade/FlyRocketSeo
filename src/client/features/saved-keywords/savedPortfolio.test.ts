import { describe, expect, it } from "vitest";
import { computeSavedPortfolio } from "./savedPortfolio";

function row(
  searchVolume: number | null,
  keywordDifficulty: number | null,
  intent: string | null = null,
) {
  return { searchVolume, keywordDifficulty, intent };
}

describe("computeSavedPortfolio", () => {
  it("sums volume, averages KD, and counts quick wins", () => {
    const portfolio = computeSavedPortfolio([
      row(1000, 10, "commercial"),
      row(500, 50, "informational"),
      row(0, 5, "commercial"),
      row(null, null, "unknown"),
    ]);

    expect(portfolio.keywordCount).toBe(4);
    expect(portfolio.totalVolume).toBe(1500);
    expect(portfolio.averageDifficulty).toBe(Math.round((10 + 50 + 5) / 3));
    // KD 10 with volume counts; KD 5 with zero volume does not.
    expect(portfolio.quickWins).toBe(1);
  });

  it("orders the intent mix canonically and drops unknowns", () => {
    const portfolio = computeSavedPortfolio([
      row(10, null, "transactional"),
      row(10, null, "Commercial"),
      row(10, null, "commercial"),
      row(10, null, null),
    ]);
    expect(portfolio.intentMix).toEqual([
      { intent: "commercial", count: 2 },
      { intent: "transactional", count: 1 },
    ]);
  });

  it("handles an empty set", () => {
    const portfolio = computeSavedPortfolio([]);
    expect(portfolio.averageDifficulty).toBeNull();
    expect(portfolio.intentMix).toEqual([]);
  });
});
