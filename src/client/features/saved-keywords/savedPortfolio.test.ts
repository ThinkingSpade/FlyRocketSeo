import { describe, expect, it } from "vitest";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";
import { computeSavedPortfolio } from "./savedPortfolio";

function row(
  searchVolume: number | null,
  keywordDifficulty: number | null,
  intent: string | null = null,
  keyword = `kw-${searchVolume}-${keywordDifficulty}-${intent ?? "none"}`,
) {
  return { keyword, searchVolume, keywordDifficulty, intent };
}

function wrongCustomer(...keywords: string[]): Map<string, FitResult> {
  return new Map(
    keywords.map((keyword) => [
      keyword,
      { verdict: "wrong-customer" as const, reason: "not your customer" },
    ]),
  );
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
    expect(portfolio.offTarget).toBe(0);
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

  it("does not count an off-target keyword as a quick win", () => {
    const rows = [
      row(1000, 10, "informational", "plumber salary"),
      row(800, 12, "transactional", "emergency plumber"),
    ];

    expect(computeSavedPortfolio(rows).quickWins).toBe(2);

    const withFit = computeSavedPortfolio(
      rows,
      wrongCustomer("plumber salary"),
    );
    expect(withFit.quickWins).toBe(1);
    expect(withFit.offTarget).toBe(1);
    // The off-target row is still a saved keyword and still real volume; only
    // the "worth having" tile changes.
    expect(withFit.keywordCount).toBe(2);
    expect(withFit.totalVolume).toBe(1800);
  });

  it("handles an empty set", () => {
    const portfolio = computeSavedPortfolio([]);
    expect(portfolio.averageDifficulty).toBeNull();
    expect(portfolio.intentMix).toEqual([]);
    expect(portfolio.offTarget).toBe(0);
    expect(portfolio.offTargetQuickWins).toBe(0);
  });

  it("counts as excluded only the off-target keywords that would have counted", () => {
    // Both surfaces that read this phrase it as "excluded" from the quick-win
    // count — the tab's tile and the client report's shortlist sentence. Only
    // the first row here was ever a candidate: the others fail on difficulty,
    // on volume, and on having no difficulty score at all, so the profile did
    // not exclude them from anything.
    const rows = [
      row(900, 12, "transactional", "plumber salary"),
      row(900, 80, "informational", "plumber history"),
      row(0, 12, "informational", "plumber meme"),
      row(900, null, "informational", "plumber jokes"),
    ];
    const fit = wrongCustomer(
      "plumber salary",
      "plumber history",
      "plumber meme",
      "plumber jokes",
    );

    const portfolio = computeSavedPortfolio(rows, fit);

    expect(portfolio.offTarget).toBe(4);
    expect(portfolio.offTargetQuickWins).toBe(1);
  });

  it("never reports more excluded than the fit verdict actually cost", () => {
    // The invariant behind the sentence: removing the verdict must raise
    // `quickWins` by exactly `offTargetQuickWins`, and by no more.
    const rows = [
      row(900, 12, "transactional", "plumber salary"),
      row(900, 80, "informational", "plumber history"),
      row(700, 5, "commercial", "emergency plumber"),
    ];
    const fit = wrongCustomer("plumber salary", "plumber history");

    const withFit = computeSavedPortfolio(rows, fit);
    const withoutFit = computeSavedPortfolio(rows);

    expect(withoutFit.quickWins - withFit.quickWins).toBe(
      withFit.offTargetQuickWins,
    );
    expect(withFit.offTargetQuickWins).toBeLessThanOrEqual(withFit.offTarget);
  });
});
