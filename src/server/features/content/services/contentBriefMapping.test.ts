import { describe, expect, it } from "vitest";
import type { InstantPageAuditItem } from "@/server/lib/dataforseo/onpage";
import {
  extractBriefTerms,
  extractCompetitorPage,
} from "./contentBriefMapping";

describe("extractBriefTerms", () => {
  it("retains reported zero while invalid count estimates stay unknown", () => {
    const invalid = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1];
    const terms = extractBriefTerms(
      [0, ...invalid].map((volume, index) => ({
        keyword_data: {
          keyword: `term ${index}`,
          keyword_info: { search_volume: volume },
        },
      })),
    );
    expect(terms).toEqual([
      { keyword: "term 0", searchVolume: 0 },
      ...invalid.map((_, index) => ({
        keyword: `term ${index + 1}`,
        searchVolume: null,
      })),
    ]);
  });
  it("dedupes, sorts by volume, and tolerates junk items", () => {
    const terms = extractBriefTerms([
      {
        keyword_data: {
          keyword: "Office Coffee",
          keyword_info: { search_volume: 100 },
        },
      },
      {
        keyword_data: {
          keyword: "office coffee",
          keyword_info: { search_volume: 999 },
        },
      },
      {
        keyword_data: {
          keyword: "coffee service",
          keyword_info: { search_volume: 500 },
        },
      },
      { keyword_data: { keyword: "no volume" } },
      { keyword_data: null },
      "junk",
      42,
    ]);

    expect(terms).toEqual([
      { keyword: "coffee service", searchVolume: 500 },
      { keyword: "office coffee", searchVolume: 100 },
      { keyword: "no volume", searchVolume: null },
    ]);
  });
});

describe("extractCompetitorPage", () => {
  it("distinguishes unreported heading evidence from reported empty heading lists", () => {
    expect(
      extractCompetitorPage("https://example.com/", { meta: {} }),
    ).toMatchObject({ h2Available: false });
    expect(
      extractCompetitorPage("https://example.com/", {
        meta: { htags: { h2: [] } },
      }),
    ).toMatchObject({ h2Available: true });
  });
  it.each([-1, 2.5, Number.MAX_SAFE_INTEGER + 1])(
    "does not create a word-count target from invalid count %s",
    (value) => {
      expect(
        extractCompetitorPage("https://example.com/", {
          meta: { content: { plain_text_word_count: value } },
        }),
      ).toMatchObject({ wordCount: null });
    },
  );
  it("pulls title, word count, and heading texts", () => {
    const item: InstantPageAuditItem = {
      url: "https://example.com/final",
      meta: {
        title: "Coffee Guide",
        htags: {
          h1: ["Main"],
          h2: ["  Pricing ", "Machines", ""],
          h3: ["FAQ"],
        },
        content: { plain_text_word_count: 1200 },
      },
    };

    expect(extractCompetitorPage("https://seed.example/", item)).toEqual({
      url: "https://example.com/final",
      title: "Coffee Guide",
      wordCount: 1200,
      h2: ["Pricing", "Machines"],
      h3: ["FAQ"],
      h2Available: true,
    });
  });

  it("uses safe defaults when fields are missing", () => {
    expect(
      extractCompetitorPage(
        "https://seed.example/",
        {} as InstantPageAuditItem,
      ),
    ).toEqual({
      url: "https://seed.example/",
      title: "",
      wordCount: null,
      h2: [],
      h3: [],
      h2Available: false,
    });
  });
});
