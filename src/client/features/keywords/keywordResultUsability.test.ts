import { describe, expect, it } from "vitest";
import type { KeywordResearchRow } from "@/types/keywords";
import {
  hasUsableMetrics,
  resolveKeywordResultUsability,
} from "./keywordResultUsability";

const SEED = "office snack refreshment program";

function row(overrides: Partial<KeywordResearchRow> = {}): KeywordResearchRow {
  return {
    keyword: SEED,
    searchVolume: null,
    trend: [],
    keywordDifficulty: null,
    cpc: null,
    competition: null,
    intent: "unknown",
    ...overrides,
  };
}

describe("hasUsableMetrics", () => {
  it("rejects the bare seed Google Ads echoes back with nothing attached", () => {
    expect(hasUsableMetrics(row())).toBe(false);
  });

  it.each([
    ["search volume", { searchVolume: 40 }],
    ["cpc", { cpc: 3.15 }],
    ["competition", { competition: 0.42 }],
    ["keyword difficulty", { keywordDifficulty: 27 }],
    ["search intent alone", { intent: "transactional" as const }],
  ])("accepts a row carrying %s", (_label, overrides) => {
    expect(hasUsableMetrics(row(overrides))).toBe(true);
  });

  it("treats a MEASURED zero volume as data, not absence", () => {
    // The mapper preserves 0 separately from null, and "Google measured this
    // and found no demand" is an answer. Calling it absence would hide a real
    // verdict and invite the user to pay for the same search again.
    expect(hasUsableMetrics(row({ searchVolume: 0 }))).toBe(true);
    expect(hasUsableMetrics(row({ cpc: 0 }))).toBe(true);
  });

  it("ignores an all-zero trend but accepts one that actually moved", () => {
    const flat = [
      { year: 2026, month: 6, searchVolume: 0 },
      { year: 2026, month: 7, searchVolume: 0 },
    ];
    expect(hasUsableMetrics(row({ trend: flat }))).toBe(false);
    expect(
      hasUsableMetrics(
        row({ trend: [...flat, { year: 2026, month: 8, searchVolume: 12 }] }),
      ),
    ).toBe(true);
  });
});

describe("resolveKeywordResultUsability", () => {
  it("reports no-metrics for the real Texas failure: the seed alone, every field null", () => {
    expect(resolveKeywordResultUsability([row()], SEED)).toEqual({
      kind: "no-metrics",
      rowCount: 1,
    });
  });

  it("NEVER hides a page of keyword ideas, even with no figures on any of them", () => {
    // The list of ideas is itself what the user paid for. Suppressing the
    // table would take export, save and rank-tracking with it.
    const rows = [
      row(),
      ...Array.from({ length: 149 }, (_, i) => row({ keyword: `idea ${i}` })),
    ];
    expect(resolveKeywordResultUsability(rows, SEED)).toEqual({
      kind: "usable",
    });
  });

  it("is usable when even one row carries a figure", () => {
    expect(
      resolveKeywordResultUsability([row(), row({ searchVolume: 90 })], SEED),
    ).toEqual({ kind: "usable" });
  });

  it("matches the seed case-insensitively and ignores surrounding space", () => {
    expect(
      resolveKeywordResultUsability(
        [row({ keyword: "  Office Snack Refreshment Program " })],
        SEED,
      ),
    ).toEqual({ kind: "no-metrics", rowCount: 1 });
  });

  it("leaves an empty result to the tab's own no-results state", () => {
    // Reporting no-metrics here would put two competing empty states on
    // screen for the same run.
    expect(resolveKeywordResultUsability([], SEED)).toEqual({ kind: "usable" });
  });
});
