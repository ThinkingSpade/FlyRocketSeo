import { describe, expect, it } from "vitest";
import { serpOverviewSchema } from "./serp";
const saved = {
  keyword: "alpha",
  locationCode: 2840,
  languageCode: "en",
  keywordStats: { searchVolume: 0, keywordDifficulty: 101, cpc: -1 },
  results: [
    {
      rank: 0,
      title: "Example",
      url: "https://example.com",
      domain: "example.com",
      description: null,
      etv: -1,
      backlinks: 0.5,
      referringDomains: 0,
      previousRank: null,
      isNew: false,
      isUp: false,
      isDown: false,
      domainEtv: 0,
    },
  ],
  paaQuestions: [],
  serpFeatures: [],
  totalOrganic: 1,
  fetchedAt: "2026-10-01T00:00:00.000Z",
  domainTrafficUnavailable: false,
  keywordStatsUnavailable: false,
};
describe("restored SERP contracts", () => {
  it("keeps useful legacy rows/capture while invalid metrics remain unknown and genuine zero survives", () => {
    const result = serpOverviewSchema.parse(saved);
    expect(result.fetchedAt).toBe(saved.fetchedAt);
    expect(result.results[0]).toMatchObject({
      rank: null,
      etv: null,
      backlinks: null,
      referringDomains: 0,
      domainEtv: 0,
    });
    expect(result.keywordStats).toEqual({
      searchVolume: 0,
      keywordDifficulty: null,
      cpc: null,
    });
  });
});
