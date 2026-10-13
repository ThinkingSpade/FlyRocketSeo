import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  overview: vi.fn(),
  cache: new Map<string, unknown>(),
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    labs: { keywordOverview: state.overview },
    keywords: { adsSearchVolume: vi.fn() },
  }),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: unknown) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => state.cache.get(key),
  setCached: async (key: string, result: unknown) => {
    state.cache.set(key, result);
  },
}));
import { getKeywordDifficultyOverview } from "./difficulty-overview";
const input = {
  projectId: "p1",
  keywords: ["seo", "missing"],
  locationCode: 2840,
  languageCode: "en",
};
const billing = {
  organizationId: "org",
  userId: "u1",
  userEmail: "test@example.com",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.cache.clear();
  state.overview.mockResolvedValue([
    { keyword: "seo", keyword_properties: { keyword_difficulty: 0 } },
  ]);
});
describe("On-demand keyword difficulty evidence", () => {
  it("records missing requested keywords as unknown so one attempt does not invite repeated spend", async () => {
    const rows = await getKeywordDifficultyOverview(input, billing);
    expect(rows).toMatchObject([
      {
        keyword: "seo",
        keywordDifficulty: 0,
        availability: "observed",
        scope: { projectId: "p1", locationCode: 2840, languageCode: "en" },
      },
      { keyword: "missing", keywordDifficulty: null, availability: "missing" },
    ]);
    expect(await getKeywordDifficultyOverview(input, billing)).toEqual(rows);
    expect(state.overview).toHaveBeenCalledOnce();
  });
  it("preserves original source/capture on restored cache and isolates tenants", async () => {
    const [row] = await getKeywordDifficultyOverview(input, billing);
    expect(row.source).toBe("DataForSEO Labs");
    expect(typeof row.fetchedAt).toBe("string");
    await getKeywordDifficultyOverview(input, {
      ...billing,
      organizationId: "other",
    });
    expect(state.overview).toHaveBeenCalledTimes(2);
  });
  it("refuses a metro rather than buying an unusable Labs request", async () => {
    await expect(
      getKeywordDifficultyOverview(
        { ...input, locationCode: 1026339 },
        billing,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(state.overview).not.toHaveBeenCalled();
  });
});
