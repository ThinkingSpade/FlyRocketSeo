import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: vi.fn(),
}));

import {
  KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo,
  MonthlySearchesInfo,
} from "dataforseo-client";
import { fetchResearchRowsBySource, mapAdsKeywordItems } from "./research-data";
import { createDataforseoClient } from "@/server/lib/dataforseo";

const adsItem = (
  data: ConstructorParameters<
    typeof KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo
  >[0],
) => new KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo(data);

describe("mapAdsKeywordItems", () => {
  it("maps Google Ads items to research rows without KD/intent", () => {
    const rows = mapAdsKeywordItems([
      adsItem({
        keyword: "Hotel Reykjavik",
        search_volume: 1300,
        cpc: 2.54,
        competition: "HIGH",
        competition_index: 42,
        monthly_searches: [
          new MonthlySearchesInfo({
            year: 2026,
            month: 5,
            search_volume: 1300,
          }),
        ],
      }),
    ]);

    expect(rows).toEqual([
      {
        keyword: "hotel reykjavik",
        searchVolume: 1300,
        trend: [{ year: 2026, month: 5, searchVolume: 1300 }],
        cpc: 2.54,
        competition: 0.42,
        keywordDifficulty: null,
        intent: "unknown",
      },
    ]);
  });

  it("dedupes case-variant keywords and skips empty ones", () => {
    const rows = mapAdsKeywordItems([
      adsItem({ keyword: "northern lights tour", search_volume: 320 }),
      adsItem({ keyword: "Northern Lights Tour", search_volume: 320 }),
      adsItem({ keyword: undefined }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      keyword: "northern lights tour",
      searchVolume: 320,
      competition: null,
      cpc: null,
      trend: [],
    });
  });

  it("preserves unknown monthly observations and rejects invalid Ads metrics", () => {
    expect(
      mapAdsKeywordItems([
        adsItem({
          keyword: "hotel",
          search_volume: -1,
          cpc: -2,
          competition_index: 110,
          monthly_searches: [
            new MonthlySearchesInfo({ year: 2026, month: 1 }),
            new MonthlySearchesInfo({ year: 2026, month: 2, search_volume: 0 }),
            new MonthlySearchesInfo({
              year: 2026,
              month: 13,
              search_volume: 9,
            }),
          ],
        }),
      ])[0],
    ).toMatchObject({
      searchVolume: null,
      cpc: null,
      competition: null,
      trend: [
        { year: 2026, month: 1, searchVolume: null },
        { year: 2026, month: 2, searchVolume: 0 },
      ],
    });
  });

  it("prefers clickstream zero only with explicit opt-in on research lists", async () => {
    const items = [
      {
        keyword: "hotel",
        keyword_info: { search_volume: 9, cpc: 0.1234, competition: 2 },
        keyword_info_normalized_with_clickstream: { search_volume: 0 },
        keyword_properties: { keyword_difficulty: 1.5 },
      },
    ];
    // Only this one endpoint is observed by the mapper; the SDK transport is tested separately.
    vi.mocked(createDataforseoClient, { partial: true }).mockReturnValue({
      keywords: {
        related: vi.fn(),
        forSite: vi.fn(),
        bulkDifficulty: vi.fn(),
        searchIntent: vi.fn(),
        trends: vi.fn(),
        clickstreamVolume: vi.fn(),
        globalVolume: vi.fn(),
        ideas: vi.fn(),
        suggestions: vi.fn().mockResolvedValue(items),
        adsIdeas: vi.fn(),
        adsSearchVolume: vi.fn(),
      },
    });
    const input = {
      seedKeyword: "hotel",
      locationCode: 2840,
      languageCode: "en",
      resultLimit: 150,
      source: "suggestions" as const,
    };
    const billing = {
      organizationId: "test",
      userId: "user",
      userEmail: "fixture@example.com",
    };
    expect((await fetchResearchRowsBySource(input, billing))[0]).toMatchObject({
      searchVolume: 9,
      cpc: 0.1234,
      competition: null,
      keywordDifficulty: null,
    });
    expect(
      (
        await fetchResearchRowsBySource(
          { ...input, includeClickstreamData: true },
          billing,
        )
      )[0].searchVolume,
    ).toBe(0);
  });
});
