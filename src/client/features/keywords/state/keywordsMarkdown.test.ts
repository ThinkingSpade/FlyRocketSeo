import { describe, expect, it } from "vitest";
import { keywordsToMarkdown } from "./keywordsMarkdown";

// Rows mirror the `keywordResearchExportRow` shape:
// [keyword, volume, cpc, competition, keywordDifficulty, intent]

describe("keywordsToMarkdown", () => {
  it("renders a GitHub-flavored table with header, separator, and rows", () => {
    const md = keywordsToMarkdown([
      ["seo audit", 1200, 1.5, 0.42, 45, "commercial"],
      ["site speed", 800, 0, 0.1, 30, "informational"],
    ]);

    expect(md).toBe(
      [
        "| Keyword | Volume | Difficulty | CPC | Intent |",
        "| --- | --- | --- | --- | --- |",
        "| seo audit | 1200 | 45 | $1.50 | commercial |",
        "| site speed | 800 | 30 | $0.00 | informational |",
      ].join("\n"),
    );
  });

  it("formats missing metrics as em dashes", () => {
    // keywordResearchExportRow emits "" for null volume/cpc/difficulty.
    const md = keywordsToMarkdown([["ai tools", "", "", "", "", "unknown"]]);

    expect(md).toContain("| ai tools | — | — | — | unknown |");
  });

  it("returns just the header and separator for empty input", () => {
    expect(keywordsToMarkdown([])).toBe(
      [
        "| Keyword | Volume | Difficulty | CPC | Intent |",
        "| --- | --- | --- | --- | --- |",
      ].join("\n"),
    );
  });

  it("escapes pipe characters so the table stays valid", () => {
    const md = keywordsToMarkdown([
      ["a|b tool", 10, 0.5, 0.2, 20, "commercial"],
    ]);

    expect(md).toContain("| a\\|b tool | 10 | 20 | $0.50 | commercial |");
  });
});
