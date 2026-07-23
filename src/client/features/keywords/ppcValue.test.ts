import { describe, expect, it } from "vitest";
import { buildPpcKeywords, totalMonthlyCost } from "./ppcValue";

type Row = Parameters<typeof buildPpcKeywords>[0][number];

function row(
  keyword: string,
  searchVolume: number | null,
  cpc: number | null,
  keywordDifficulty: number | null = 50,
): Row {
  return {
    keyword,
    searchVolume,
    cpc,
    keywordDifficulty,
    trend: [],
    competition: null,
    intent: "commercial",
  };
}

describe("buildPpcKeywords", () => {
  // Without both numbers there is no cost to reason about, and showing 0 would
  // read as "free" rather than "unknown".
  it("drops keywords missing volume or CPC", () => {
    const built = buildPpcKeywords(
      [row("a", 0, 5), row("b", 100, null), row("c", 100, 5)],
      10,
    );

    expect(built.map((k) => k.keyword)).toEqual(["c"]);
  });

  it("sizes monthly cost from volume, assumed CTR and CPC", () => {
    const [built] = buildPpcKeywords([row("a", 1000, 4)], 10);

    // 1000 * 0.25 CTR * $4
    expect(built?.monthlyCostUsd).toBe(1000);
  });

  it("ranks by the most expensive traffic first", () => {
    const built = buildPpcKeywords(
      [row("cheap", 100, 1), row("pricey", 1000, 10)],
      10,
    );

    expect(built[0]?.keyword).toBe("pricey");
  });

  it("says rank-it when clicks are expensive but the keyword is winnable", () => {
    const [built] = buildPpcKeywords([row("a", 500, 8, 20)], 10);

    expect(built?.verdict).toBe("rank-it");
  });

  it("says buy-it when clicks are cheap but ranking is hard", () => {
    const [built] = buildPpcKeywords([row("a", 500, 1, 80)], 10);

    expect(built?.verdict).toBe("buy-it");
  });

  it("stays balanced when difficulty is unknown", () => {
    const [built] = buildPpcKeywords([row("a", 500, 9, null)], 10);

    expect(built?.verdict).toBe("balanced");
  });

  it("totals the surfaced spend", () => {
    const built = buildPpcKeywords([row("a", 1000, 4), row("b", 1000, 2)], 10);

    expect(totalMonthlyCost(built)).toBe(1500);
  });
});
