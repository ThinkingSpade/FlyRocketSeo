import { describe, expect, it } from "vitest";
import type { KeywordResearchRow } from "@/types/keywords";
import {
  buildKeywordRelevanceView,
  isHiddenByOffTopicCollapse,
} from "./keywordRelevanceView";

function row(
  keyword: string,
  searchVolume: number | null = null,
): KeywordResearchRow {
  return {
    keyword,
    searchVolume,
    trend: [],
    keywordDifficulty: null,
    cpc: null,
    competition: null,
    intent: "unknown",
  };
}

// Mirrors the finding's own scenario: 4 on-topic + 4 off-topic rows for seed
// "delio". "pricing" is shared by two on-topic rows (stable across the toggle
// either way); "meaning" is shared by one on-topic row and two off-topic ones
// (only crosses the >1 group threshold once the collapse is lifted).
const rows = [
  row("delio pro", 100),
  row("delio pricing guide", 90),
  row("delio pricing plans", 80),
  row("delio meaning", 50),
  row("obnoxious meaning", 40),
  row("aria name meaning", 20),
  row("what does the name kevin mean", 5),
  row("baby girl names 2026", 1),
];

describe("buildKeywordRelevanceView", () => {
  it("hides off-topic rows from both relevanceVisibleRows and keywordGroups when collapsed", () => {
    const view = buildKeywordRelevanceView(rows, "delio", false);

    expect(view.onTopic.map((r) => r.keyword)).toEqual([
      "delio pro",
      "delio pricing guide",
      "delio pricing plans",
      "delio meaning",
    ]);
    expect(view.offTopic).toHaveLength(4);
    expect(view.relevanceVisibleRows).toBe(view.onTopic);

    const byTerm = Object.fromEntries(
      view.keywordGroups.map((g) => [g.term, g]),
    );
    // Shared by two on-topic rows — present regardless of the toggle.
    expect(byTerm.pricing).toMatchObject({ keywordCount: 2, totalVolume: 170 });
    // Only one on-topic row contains it (below the >1 threshold) while the
    // two off-topic rows that also share it are collapsed — the rail's count
    // has to match what the table renders under it.
    expect(byTerm.meaning).toBeUndefined();
  });

  it("reveals the off-topic rows into both relevanceVisibleRows and keywordGroups once shown", () => {
    const view = buildKeywordRelevanceView(rows, "delio", true);

    // On-topic first, then off-topic — the same order the table renders.
    expect(view.relevanceVisibleRows.map((r) => r.keyword)).toEqual([
      "delio pro",
      "delio pricing guide",
      "delio pricing plans",
      "delio meaning",
      "obnoxious meaning",
      "aria name meaning",
      "what does the name kevin mean",
      "baby girl names 2026",
    ]);

    const byTerm = Object.fromEntries(
      view.keywordGroups.map((g) => [g.term, g]),
    );
    // Unaffected by the reveal: both "pricing" rows were already on-topic.
    expect(byTerm.pricing).toMatchObject({ keywordCount: 2, totalVolume: 170 });
    // Now crosses the threshold: "delio meaning" (on-topic) plus the two
    // off-topic rows that share the word.
    expect(byTerm.meaning).toMatchObject({ keywordCount: 3, totalVolume: 110 });
  });

  it("keeps every row on-topic when there is no seed, regardless of the toggle", () => {
    const noSeedRows = [row("a widget"), row("b widget"), row("c widget")];
    const hidden = buildKeywordRelevanceView(noSeedRows, "", false);
    const shown = buildKeywordRelevanceView(noSeedRows, "", true);

    expect(hidden.offTopic).toEqual([]);
    expect(hidden.relevanceVisibleRows).toHaveLength(3);
    expect(shown.relevanceVisibleRows).toHaveLength(3);
  });
});

describe("isHiddenByOffTopicCollapse", () => {
  it("is true only when the collapse — not a filter or group slice — is what emptied the view", () => {
    expect(
      isHiddenByOffTopicCollapse({
        offTopicCount: 4,
        visibleRowCount: 0,
        activeFilterCount: 0,
        groupTerm: null,
      }),
    ).toBe(true);
  });

  it("is false when a text/range filter is active, even if nothing is visible", () => {
    expect(
      isHiddenByOffTopicCollapse({
        offTopicCount: 4,
        visibleRowCount: 0,
        activeFilterCount: 1,
        groupTerm: null,
      }),
    ).toBe(false);
  });

  it("is false when a group-rail term is active, even if nothing is visible", () => {
    expect(
      isHiddenByOffTopicCollapse({
        offTopicCount: 4,
        visibleRowCount: 0,
        activeFilterCount: 0,
        groupTerm: "coffee",
      }),
    ).toBe(false);
  });

  it("is false when there were no off-topic rows to begin with", () => {
    expect(
      isHiddenByOffTopicCollapse({
        offTopicCount: 0,
        visibleRowCount: 0,
        activeFilterCount: 0,
        groupTerm: null,
      }),
    ).toBe(false);
  });

  it("is false whenever rows are actually visible", () => {
    expect(
      isHiddenByOffTopicCollapse({
        offTopicCount: 4,
        visibleRowCount: 4,
        activeFilterCount: 0,
        groupTerm: null,
      }),
    ).toBe(false);
  });
});
