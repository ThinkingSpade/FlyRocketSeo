import { describe, expect, it } from "vitest";
import type { KeywordResearchRow } from "@/types/keywords";
import {
  hasUsableMetrics,
  resolveKeywordResultUsability,
} from "./keywordResultUsability";

function row(overrides: Partial<KeywordResearchRow> = {}): KeywordResearchRow {
  return {
    keyword: "office snack refreshment program",
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
  ])("accepts a row carrying %s", (_label, overrides) => {
    expect(hasUsableMetrics(row(overrides))).toBe(true);
  });

  it("treats zero volume as absent, not as a measurement", () => {
    // A table of zeroes is exactly as useless as a table of dashes, and
    // Google Ads reports "no data" this way once it reaches our row type.
    expect(hasUsableMetrics(row({ searchVolume: 0 }))).toBe(false);
  });

  it("ignores an all-zero trend but accepts one that actually moved", () => {
    const flat = [
      { year: 2026, month: 6, searchVolume: 0 },
      { year: 2026, month: 7, searchVolume: 0 },
    ];
    expect(hasUsableMetrics(row({ trend: flat }))).toBe(false);
    expect(
      hasUsableMetrics({
        ...row(),
        trend: [...flat, { year: 2026, month: 8, searchVolume: 12 }],
      }),
    ).toBe(true);
  });
});

describe("resolveKeywordResultUsability", () => {
  it("reports no-metrics for the real Texas failure: one row, every field null", () => {
    expect(resolveKeywordResultUsability([row()])).toEqual({
      kind: "no-metrics",
      rowCount: 1,
    });
  });

  it("reports no-metrics for a full page that is entirely empty", () => {
    const rows = Array.from({ length: 150 }, (_, i) =>
      row({ keyword: `keyword ${i}` }),
    );
    expect(resolveKeywordResultUsability(rows)).toEqual({
      kind: "no-metrics",
      rowCount: 150,
    });
  });

  it("is usable when even one row carries a figure", () => {
    expect(
      resolveKeywordResultUsability([row(), row({ searchVolume: 90 })]),
    ).toEqual({ kind: "usable" });
  });

  it("leaves an empty result to the tab's own no-results state", () => {
    // Reporting no-metrics here would put two competing empty states on
    // screen for the same run.
    expect(resolveKeywordResultUsability([])).toEqual({ kind: "usable" });
  });
});
