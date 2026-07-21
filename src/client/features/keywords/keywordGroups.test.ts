import { describe, expect, it } from "vitest";
import type { KeywordResearchRow } from "@/types/keywords";
import {
  computeKeywordTotals,
  extractKeywordGroups,
  sortKeywordGroups,
} from "./keywordGroups";

function row(
  keyword: string,
  searchVolume: number | null = null,
  keywordDifficulty: number | null = null,
): KeywordResearchRow {
  return {
    keyword,
    searchVolume,
    trend: [],
    keywordDifficulty,
    cpc: null,
    competition: null,
    intent: "unknown",
  };
}

describe("extractKeywordGroups", () => {
  it("groups by shared terms, excluding the seed query's own words", () => {
    const groups = extractKeywordGroups(
      [
        row("coffee vending services dallas", 210),
        row("coffee vending machine dallas", 90),
        row("vending machine services near me", 90),
        row("office vending services dallas", 140),
      ],
      "vending services dallas",
    );

    const byTerm = Object.fromEntries(groups.map((g) => [g.term, g]));
    expect(byTerm["coffee"]).toMatchObject({
      keywordCount: 2,
      totalVolume: 300,
    });
    expect(byTerm["machine"]).toMatchObject({
      keywordCount: 2,
      totalVolume: 180,
    });
    // Seed terms never become groups.
    expect(byTerm["vending"]).toBeUndefined();
    expect(byTerm["dallas"]).toBeUndefined();
  });

  it("drops stopwords, single-keyword terms, and double counting", () => {
    const groups = extractKeywordGroups(
      [
        row("vending machines for the office", 10),
        row("office office vending", 20),
        row("unique snowflake keyword", 5),
      ],
      "vending",
    );

    const byTerm = Object.fromEntries(groups.map((g) => [g.term, g]));
    expect(byTerm["for"]).toBeUndefined();
    expect(byTerm["the"]).toBeUndefined();
    expect(byTerm["snowflake"]).toBeUndefined();
    // "office" appears twice in one keyword but counts once for it.
    expect(byTerm["office"]).toMatchObject({
      keywordCount: 2,
      totalVolume: 30,
    });
  });

  it("keeps meaningful modifiers like numbers and 'near'", () => {
    const groups = extractKeywordGroups(
      [
        row("24 hour vending dallas", 50),
        row("24 7 vending service", 30),
        row("vending near me", 20),
        row("vending machines near me", 10),
      ],
      "vending",
    );
    const terms = groups.map((g) => g.term);
    expect(terms).toContain("24");
    expect(terms).toContain("near");
    expect(terms).toContain("me");
  });
});

describe("sortKeywordGroups", () => {
  it("sorts by count or by volume", () => {
    const groups = [
      { term: "coffee", keywordCount: 2, totalVolume: 300 },
      { term: "machine", keywordCount: 3, totalVolume: 100 },
    ];
    expect(sortKeywordGroups(groups, "count")[0].term).toBe("machine");
    expect(sortKeywordGroups(groups, "volume")[0].term).toBe("coffee");
  });
});

describe("computeKeywordTotals", () => {
  it("sums volume and averages difficulty over rows that have one", () => {
    const totals = computeKeywordTotals([
      row("a", 100, 40),
      row("b", 50, 20),
      row("c", null, null),
    ]);
    expect(totals).toEqual({
      keywordCount: 3,
      totalVolume: 150,
      averageDifficulty: 30,
    });
  });

  it("returns null difficulty when no row has one", () => {
    expect(computeKeywordTotals([row("a", 10)]).averageDifficulty).toBeNull();
  });
});
