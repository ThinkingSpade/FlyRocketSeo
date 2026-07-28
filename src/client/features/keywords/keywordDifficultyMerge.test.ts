import { describe, expect, it } from "vitest";
import {
  mergeDifficultyOverview,
  selectDifficultyBackfillKeywords,
  type DifficultyOverviewByKeyword,
} from "./keywordDifficultyMerge";
import type { KeywordResearchRow } from "@/types/keywords";
import type { KeywordDifficultyOverviewRow } from "@/types/schemas/keywords";

function row(overrides: Partial<KeywordResearchRow> = {}): KeywordResearchRow {
  return {
    keyword: "coffee shop",
    searchVolume: 1000,
    trend: [],
    keywordDifficulty: null,
    cpc: null,
    competition: null,
    intent: "unknown",
    ...overrides,
  };
}

function overviewRow(
  overrides: Partial<KeywordDifficultyOverviewRow> = {},
): KeywordDifficultyOverviewRow {
  return {
    keyword: "coffee shop",
    keywordDifficulty: 42,
    intent: "commercial",
    ...overrides,
  };
}

function byKeywordOf(
  ...rows: KeywordDifficultyOverviewRow[]
): DifficultyOverviewByKeyword {
  return new Map(rows.map((r) => [r.keyword.toLowerCase(), r]));
}

describe("mergeDifficultyOverview", () => {
  it("overlays a loaded difficulty and intent onto a row that had neither", () => {
    const target = row({ keyword: "Coffee Shop", keywordDifficulty: null });
    const byKeyword = byKeywordOf(
      overviewRow({
        keyword: "coffee shop",
        keywordDifficulty: 42,
        intent: "commercial",
      }),
    );

    const merged = mergeDifficultyOverview(target, byKeyword);

    expect(merged.keywordDifficulty).toBe(42);
    expect(merged.intent).toBe("commercial");
  });

  it("matches the loaded entry case-insensitively", () => {
    const target = row({ keyword: "COFFEE SHOP" });
    const byKeyword = byKeywordOf(overviewRow({ keyword: "coffee shop" }));

    const merged = mergeDifficultyOverview(target, byKeyword);

    expect(merged.keywordDifficulty).toBe(42);
  });

  it("keeps the row's own intent when the loaded row's intent is null", () => {
    const target = row({ intent: "transactional" });
    const byKeyword = byKeywordOf(
      overviewRow({ keywordDifficulty: 10, intent: null }),
    );

    const merged = mergeDifficultyOverview(target, byKeyword);

    expect(merged.keywordDifficulty).toBe(10);
    expect(merged.intent).toBe("transactional");
  });

  it("keeps the row's own difficulty when the loaded row's difficulty is null", () => {
    // Defensive: the eligibility gate should never route an already-answered
    // row through a load, but this function does not trust the caller for it.
    const target = row({ keywordDifficulty: 55 });
    const byKeyword = byKeywordOf(
      overviewRow({ keywordDifficulty: null, intent: "commercial" }),
    );

    const merged = mergeDifficultyOverview(target, byKeyword);

    expect(merged.keywordDifficulty).toBe(55);
  });

  it("returns the same row reference when nothing was loaded for this keyword", () => {
    const target = row({ keyword: "unrelated term" });
    const byKeyword = byKeywordOf(overviewRow({ keyword: "coffee shop" }));

    expect(mergeDifficultyOverview(target, byKeyword)).toBe(target);
  });

  it("returns the same row reference against an empty map", () => {
    const target = row();
    expect(mergeDifficultyOverview(target, byKeywordOf())).toBe(target);
  });
});

describe("selectDifficultyBackfillKeywords", () => {
  it("selects every row missing difficulty when none have been attempted", () => {
    const rows = [
      row({ keyword: "a", keywordDifficulty: null }),
      row({ keyword: "b", keywordDifficulty: null }),
    ];

    expect(selectDifficultyBackfillKeywords(rows, byKeywordOf(), 100)).toEqual([
      "a",
      "b",
    ]);
  });

  it("excludes rows that already have a difficulty value", () => {
    const rows = [
      row({ keyword: "a", keywordDifficulty: 30 }),
      row({ keyword: "b", keywordDifficulty: null }),
    ];

    expect(selectDifficultyBackfillKeywords(rows, byKeywordOf(), 100)).toEqual([
      "b",
    ]);
  });

  it("excludes a row that was already attempted, even though it is still null", () => {
    // The Labs response can genuinely have no answer for a keyword -- once
    // asked, it must not keep re-qualifying for another click forever.
    const rows = [
      row({ keyword: "a", keywordDifficulty: null }),
      row({ keyword: "b", keywordDifficulty: null }),
    ];
    const byKeyword = byKeywordOf(
      overviewRow({ keyword: "a", keywordDifficulty: null, intent: null }),
    );

    expect(selectDifficultyBackfillKeywords(rows, byKeyword, 100)).toEqual([
      "b",
    ]);
  });

  it("caps the result at max, preserving row order", () => {
    const rows = [
      row({ keyword: "a", keywordDifficulty: null }),
      row({ keyword: "b", keywordDifficulty: null }),
      row({ keyword: "c", keywordDifficulty: null }),
    ];

    expect(selectDifficultyBackfillKeywords(rows, byKeywordOf(), 2)).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns an empty array when nothing on the page is missing difficulty", () => {
    const rows = [row({ keyword: "a", keywordDifficulty: 12 })];
    expect(selectDifficultyBackfillKeywords(rows, byKeywordOf(), 100)).toEqual(
      [],
    );
  });

  it("returns an empty array for an empty page", () => {
    expect(selectDifficultyBackfillKeywords([], byKeywordOf(), 100)).toEqual(
      [],
    );
  });
});
