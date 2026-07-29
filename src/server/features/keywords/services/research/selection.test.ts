import { describe, expect, it } from "vitest";
import {
  AUTO_KEYWORD_SOURCES,
  countNonSeedKeywords,
  countRelevantKeywords,
  hasSufficientCoverage,
  selectResearchRows,
} from "./selection";
import type { EnrichedKeyword } from "./helpers";

/**
 * The scenario behind these: Keyword Research on deliotx.com returned 46 rows
 * about the meaning of names. Every one differed from the seed, so the old
 * row-counting coverage test passed perfectly.
 */

function row(keyword: string): EnrichedKeyword {
  return {
    keyword,
    searchVolume: 100,
    cpc: null,
    competition: null,
    keywordDifficulty: null,
    intent: "unknown",
    trend: [],
  };
}

const DRIFTED = [
  "obnoxious meaning",
  "aria name meaning",
  "zella name meaning",
  "lia name meaning",
  "delia meaning",
].map(row);

// None of these is the seed itself — the seed row is never counted as
// coverage, so including it here would quietly cost a row.
const ON_TOPIC = [
  "coffee service pricing",
  "break room coffee",
  "coffee delivery service",
  "office coffee supplier",
  "office coffee machines",
].map(row);

describe("AUTO_KEYWORD_SOURCES", () => {
  it("tries the source that cannot change the subject first", () => {
    // keyword_suggestions returns keywords containing the seed, so it cannot
    // drift; related walks Google's graph and is the only one that can.
    expect(AUTO_KEYWORD_SOURCES[0]).toBe("suggestions");
    expect(AUTO_KEYWORD_SOURCES.at(-1)).toBe("related");
  });
});

describe("countNonSeedKeywords", () => {
  it("counts every row that is not the seed itself", () => {
    expect(countNonSeedKeywords([row("delio"), ...DRIFTED], "delio")).toBe(5);
  });
});

describe("countRelevantKeywords", () => {
  it("does not count rows that share no word with the seed", () => {
    expect(countRelevantKeywords(DRIFTED, "office coffee service")).toBe(0);
  });

  it("counts rows sharing one meaningful word", () => {
    expect(countRelevantKeywords(ON_TOPIC, "office coffee service")).toBe(5);
  });

  it("excludes the seed row itself", () => {
    expect(
      countRelevantKeywords(
        [row("office coffee service"), row("office coffee pricing")],
        "office coffee service",
      ),
    ).toBe(1);
  });

  it("still requires a shared word when the seed is only a stopword", () => {
    // tokenizeSeed keeps the stopword rather than returning nothing, so "the"
    // is matched literally. A degenerate seed gets a degenerate answer instead
    // of every row being waved through as relevant.
    expect(countRelevantKeywords([row("anything")], "the")).toBe(0);
    expect(countRelevantKeywords([row("the office")], "the")).toBe(1);
  });
});

describe("hasSufficientCoverage", () => {
  it("rejects a full page of drifted rows", () => {
    // The exact regression: 5 rows, all different from the seed, none about it.
    expect(hasSufficientCoverage(DRIFTED, "office coffee service", 5)).toBe(
      false,
    );
  });

  it("accepts rows that are actually about the seed", () => {
    expect(hasSufficientCoverage(ON_TOPIC, "office coffee service", 5)).toBe(
      true,
    );
  });
});

describe("selectResearchRows", () => {
  it("returns rows untouched when they fit the limit", () => {
    const rows = ON_TOPIC.slice(0, 3);
    expect(selectResearchRows(rows, "office coffee service", 10)).toEqual(rows);
  });

  it("lets a later source's relevant rows displace an earlier source's junk", () => {
    // The capacity bug this exists to prevent: drifted rows arrive first and
    // fill the budget, so without a relevant-first trim the on-topic rows
    // fetched afterwards would be dropped for lack of space.
    const selected = selectResearchRows(
      [...DRIFTED, ...ON_TOPIC],
      "office coffee service",
      5,
    );
    expect(selected.map((r) => r.keyword)).toEqual(
      ON_TOPIC.map((r) => r.keyword),
    );
  });

  it("keeps off-topic rows to fill any space the relevant ones leave", () => {
    const selected = selectResearchRows(
      [...DRIFTED, ...ON_TOPIC.slice(0, 2)],
      "office coffee service",
      4,
    );
    expect(selected).toHaveLength(4);
    // Relevant first, then the drifted ones rather than nothing.
    expect(selected.slice(0, 2).map((r) => r.keyword)).toEqual([
      "coffee service pricing",
      "break room coffee",
    ]);
  });

  it("preserves each source's own ranking within a group", () => {
    const selected = selectResearchRows(ON_TOPIC, "office coffee service", 3);
    expect(selected.map((r) => r.keyword)).toEqual([
      "coffee service pricing",
      "break room coffee",
      "coffee delivery service",
    ]);
  });

  it("keeps source order when every row is off-topic", () => {
    // Nothing matches, so the relevant group is empty and the off-topic group
    // is the whole list — the trim must not reshuffle it.
    const rows = [row("a"), row("b"), row("c")];
    expect(selectResearchRows(rows, "office coffee", 2)).toEqual(
      rows.slice(0, 2),
    );
  });

  it("trims by position when the seed tokenizes to nothing at all", () => {
    const rows = [row("a"), row("b"), row("c")];
    expect(selectResearchRows(rows, "!!!", 2)).toEqual(rows.slice(0, 2));
  });
});
