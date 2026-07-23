import { describe, expect, it } from "vitest";
import {
  AUTO_KEYWORD_SOURCES,
  countRelevantKeywords,
  hasSufficientCoverage,
} from "./selection";
import type { EnrichedKeyword } from "./helpers";

function row(keyword: string): EnrichedKeyword {
  return {
    keyword,
    searchVolume: 100,
    trend: [],
    cpc: null,
    competition: null,
    keywordDifficulty: null,
    intent: "unknown",
  };
}

describe("AUTO_KEYWORD_SOURCES", () => {
  // keyword_suggestions returns keywords containing the seed phrase, so it
  // cannot drift. related walks a graph and can, so it goes last.
  it("tries the drift-free source first and the graph walk last", () => {
    expect(AUTO_KEYWORD_SOURCES).toEqual(["suggestions", "ideas", "related"]);
  });
});

describe("countRelevantKeywords", () => {
  it("excludes the seed itself", () => {
    expect(countRelevantKeywords([row("delio")], "delio")).toBe(0);
  });

  it("excludes keywords that share no word with the seed", () => {
    const rows = [
      row("obnoxious meaning"),
      row("aria name meaning"),
      row("zella name meaning"),
    ];
    expect(countRelevantKeywords(rows, "delio")).toBe(0);
  });

  it("counts keywords that do name the seed", () => {
    expect(countRelevantKeywords([row("delio pro")], "delio")).toBe(1);
  });
});

describe("hasSufficientCoverage", () => {
  // The exact regression: 46 drifted rows previously satisfied Auto.
  it("is not satisfied by drifted rows", () => {
    const drifted = [
      "obnoxious meaning",
      "aria name meaning",
      "zella name meaning",
      "colton name meaning",
      "lia name meaning",
      "weenie meaning",
    ].map(row);
    expect(hasSufficientCoverage(drifted, "delio")).toBe(false);
  });

  it("is satisfied by five on-topic rows", () => {
    const onTopic = [
      "delio pro",
      "delio meaning",
      "delio poker",
      "delio app",
      "delio login",
    ].map(row);
    expect(hasSufficientCoverage(onTopic, "delio")).toBe(true);
  });
});
