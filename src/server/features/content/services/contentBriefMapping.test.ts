import { describe, expect, it } from "vitest";
import type { InstantPageAuditItem } from "@/server/lib/dataforseo/onpage";
import {
  extractBriefTerms,
  extractCompetitorPage,
} from "./contentBriefMapping";

describe("extractBriefTerms", () => {
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
    });
  });
});
