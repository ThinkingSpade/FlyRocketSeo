import { describe, expect, it } from "vitest";
import { mapKeywordItem } from "./domainKeywordMapper";
describe("Domain ranked keyword observations", () => {
  it("preserves zero and estimates while rejecting unsupported ranks/counts/scores", () => {
    expect(
      mapKeywordItem({
        keyword_data: {
          keyword: "seo",
          keyword_info: { search_volume: 1.5, cpc: 0.1234 },
          keyword_properties: { keyword_difficulty: 101 },
        },
        ranked_serp_element: {
          serp_item: {
            rank_absolute: 0,
            etv: 0.3456,
            url: "https://example.com/page",
          },
        },
      }),
    ).toMatchObject({
      position: null,
      searchVolume: null,
      keywordDifficulty: null,
      cpc: 0.1234,
      traffic: 0.3456,
    });
    expect(
      mapKeywordItem({
        keyword_data: {
          keyword: "seo",
          keyword_info: { search_volume: 0, cpc: 0 },
          keyword_properties: { keyword_difficulty: 0 },
        },
        ranked_serp_element: { serp_item: { rank_absolute: 2, etv: 0 } },
      }),
    ).toMatchObject({
      position: 2,
      searchVolume: 0,
      keywordDifficulty: 0,
      cpc: 0,
      traffic: 0,
    });
  });
});
