import { describe, expect, it, vi } from "vitest";

import { fetchKeywordMetricsForList } from "./keyword-metrics";

type Client = Parameters<typeof fetchKeywordMetricsForList>[0];

// Minimal fake client exposing only the two endpoints the helper touches.
function fakeClient(overrides: {
  keywordOverview?: Client["labs"]["keywordOverview"];
  adsSearchVolume?: Client["keywords"]["adsSearchVolume"];
}): Client {
  return {
    labs: { keywordOverview: overrides.keywordOverview ?? vi.fn() },
    keywords: { adsSearchVolume: overrides.adsSearchVolume ?? vi.fn() },
  };
}

describe("fetchKeywordMetricsForList", () => {
  it("normalizes Labs items and prefers clickstream-refined volume/trend", async () => {
    const keywordOverview = vi.fn().mockResolvedValue([
      {
        keyword: "best crm",
        keyword_info: {
          search_volume: 1000,
          cpc: 3.2,
          competition: 0.5,
          competition_level: "MEDIUM",
          monthly_searches: [{ year: 2026, month: 1, search_volume: 1000 }],
        },
        keyword_info_normalized_with_clickstream: {
          search_volume: 880,
          monthly_searches: [{ year: 2026, month: 1, search_volume: 880 }],
        },
        keyword_properties: { keyword_difficulty: 42 },
        search_intent_info: { main_intent: "commercial" },
      },
    ]);
    const client = fakeClient({ keywordOverview });

    const rows = await fetchKeywordMetricsForList(client, {
      keywords: ["best crm"],
      locationCode: 2840,
      languageCode: "en",
      includeClickstreamData: true,
      creditFeature: "keyword_research",
    });

    expect(keywordOverview).toHaveBeenCalledWith({
      keywords: ["best crm"],
      locationCode: 2840,
      languageCode: "en",
      includeClickstreamData: true,
      creditFeature: "keyword_research",
    });
    expect(rows).toEqual([
      {
        keyword: "best crm",
        searchVolume: 880,
        cpc: 3.2,
        competition: 0.5,
        competitionLevel: "MEDIUM",
        keywordDifficulty: 42,
        intent: "commercial",
        monthlySearches: [{ year: 2026, month: 1, searchVolume: 880 }],
      },
    ]);
  });

  it("routes Google Ads locations and scales competition_index to a 0-1 ratio", async () => {
    const adsSearchVolume = vi.fn().mockResolvedValue([
      {
        keyword: "hotel reykjavik",
        search_volume: 1300,
        cpc: 2.54,
        competition: "HIGH",
        competition_index: 42,
        monthly_searches: [{ year: 2026, month: 5, search_volume: 1300 }],
      },
      { keyword: undefined },
    ]);
    const client = fakeClient({ adsSearchVolume });

    const rows = await fetchKeywordMetricsForList(client, {
      keywords: ["hotel reykjavik"],
      locationCode: 2352,
      languageCode: "is",
      creditFeature: "rank_tracking",
    });

    expect(adsSearchVolume).toHaveBeenCalledWith({
      keywords: ["hotel reykjavik"],
      locationCode: 2352,
      languageCode: "is",
      creditFeature: "rank_tracking",
    });
    // Item without a keyword is dropped; Ads carries no KD/intent.
    expect(rows).toEqual([
      {
        keyword: "hotel reykjavik",
        searchVolume: 1300,
        cpc: 2.54,
        competition: 0.42,
        competitionLevel: "HIGH",
        keywordDifficulty: null,
        intent: null,
        monthlySearches: [{ year: 2026, month: 5, searchVolume: 1300 }],
      },
    ]);
  });

  it("batches keyword lists above the per-call cap", async () => {
    const keywordOverview = vi
      .fn()
      .mockImplementation(({ keywords }: { keywords: string[] }) =>
        Promise.resolve(
          keywords.map((keyword) => ({ keyword, keyword_info: {} })),
        ),
      );
    const client = fakeClient({ keywordOverview });
    const keywords = Array.from({ length: 1500 }, (_, i) => `kw-${i}`);

    const rows = await fetchKeywordMetricsForList(client, {
      keywords,
      locationCode: 2840,
      languageCode: "en",
      creditFeature: "keyword_research",
    });

    expect(keywordOverview).toHaveBeenCalledTimes(3); // 700 + 700 + 100
    expect(rows).toHaveLength(1500);
  });

  it("does not invent volumes or dates from missing and invalid observations", async () => {
    const client = fakeClient({
      keywordOverview: vi.fn().mockResolvedValue([
        {
          keyword: "crm",
          keyword_info: {
            search_volume: 1.5,
            cpc: -1,
            competition: 1.2,
            monthly_searches: [
              { year: 2026, month: 1 },
              { year: 2026, month: 2, search_volume: 0 },
              { year: 2026, month: 13, search_volume: 9 },
              { month: 3, search_volume: 9 },
              {
                year: 2026,
                month: 4,
                search_volume: Number.MAX_SAFE_INTEGER + 1,
              },
            ],
          },
          keyword_properties: { keyword_difficulty: 101 },
        },
      ]),
    });
    const [row] = await fetchKeywordMetricsForList(client, {
      keywords: ["crm"],
      locationCode: 2840,
      languageCode: "en",
      creditFeature: "keyword_research",
    });
    expect(row).toMatchObject({
      searchVolume: null,
      cpc: null,
      competition: null,
      keywordDifficulty: null,
      monthlySearches: [
        { year: 2026, month: 1, searchVolume: null },
        { year: 2026, month: 2, searchVolume: 0 },
        { year: 2026, month: 4, searchVolume: null },
      ],
    });
  });

  it("ignores unsolicited clickstream evidence and retains explicitly requested zero", async () => {
    const client = fakeClient({
      keywordOverview: vi.fn().mockResolvedValue([
        {
          keyword: "crm",
          keyword_info: {
            search_volume: 12,
            monthly_searches: [{ year: 2026, month: 1, search_volume: 12 }],
          },
          keyword_info_normalized_with_clickstream: {
            search_volume: 0,
            monthly_searches: [{ year: 2026, month: 1, search_volume: 0 }],
          },
        },
      ]),
    });
    const params = {
      keywords: ["crm"],
      locationCode: 2840,
      languageCode: "en",
      creditFeature: "keyword_research" as const,
    };
    expect(
      (await fetchKeywordMetricsForList(client, params))[0].searchVolume,
    ).toBe(12);
    expect(
      (
        await fetchKeywordMetricsForList(client, {
          ...params,
          includeClickstreamData: true,
        })
      )[0],
    ).toMatchObject({
      searchVolume: 0,
      monthlySearches: [{ year: 2026, month: 1, searchVolume: 0 }],
    });
  });

  it("drops foreign keyword responses and normalizes Ads competition without rounding estimates", async () => {
    const client = fakeClient({
      adsSearchVolume: vi.fn().mockResolvedValue([
        {
          keyword: "hotel",
          search_volume: 0,
          cpc: 0.1234,
          competition_index: 101,
        },
        { keyword: "foreign", search_volume: 999 },
      ]),
    });
    const rows = await fetchKeywordMetricsForList(client, {
      keywords: ["hotel"],
      locationCode: 2352,
      languageCode: "is",
      creditFeature: "keyword_research",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      searchVolume: 0,
      cpc: 0.1234,
      competition: null,
    });
  });
});
