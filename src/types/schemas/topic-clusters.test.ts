import { describe, expect, it } from "vitest";
import { topicClusterPlanSchema } from "./topic-clusters";
const plan = {
  topic: "seo",
  locationCode: 2840,
  languageCode: "en",
  fetchedAt: "2026-01-01T00:00:00.000Z",
  hub: [],
  clusters: [
    {
      name: "Tools",
      totalVolume: 0,
      keywords: [
        { keyword: "seo tools", searchVolume: null, keywordDifficulty: 101 },
      ],
    },
  ],
};
describe("Restored topic-cluster contract", () => {
  it("keeps legacy rows without certifying old defaulted aggregates", () => {
    expect(topicClusterPlanSchema.parse(plan).clusters[0]).toMatchObject({
      totalVolume: null,
      keywordCount: 1,
      keywords: [{ searchVolume: null, keywordDifficulty: null }],
    });
  });
  it("preserves new reported zero, original capture date and subset coverage", () => {
    const result = topicClusterPlanSchema.parse({
      ...plan,
      contractVersion: 2,
      clusters: [{ ...plan.clusters[0], keywordCount: 12 }],
    });
    expect(result).toMatchObject({
      source: "DataForSEO Labs",
      fetchedAt: plan.fetchedAt,
      clusters: [{ totalVolume: 0, keywordCount: 12 }],
    });
  });
});
