import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  live: vi.fn(),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, input: unknown) =>
    `${prefix}:${JSON.stringify(input)}`,
  getCached: async (key: string) => state.cache.get(key) ?? null,
  setCached: async (key: string, value: unknown) => {
    state.cache.set(key, value);
  },
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ serp: { live: state.live } }),
}));
import { getSerpAnalysis } from "./serp";
const input = {
  projectId: "project-1",
  keyword: "alpha",
  locationCode: 2840,
  languageCode: "en",
};
const customer = {
  organizationId: "org-1",
  userId: "user-1",
  userEmail: "user@example.test",
};
describe("keyword SERP research contract", () => {
  beforeEach(() => {
    state.cache.clear();
    state.live.mockReset().mockResolvedValue([
      {
        type: "organic",
        rank_absolute: 1,
        domain: "example.com",
        url: "https://example.com",
        backlinks_info: { backlinks: 0, referring_domains: 0.5 },
        etv: -1,
      },
    ]);
  });
  it("keeps enrichment null/zero, market/source/capture and scoped cache reuse", async () => {
    const first = await getSerpAnalysis(input, customer);
    expect(first.items[0]).toMatchObject({
      backlinks: 0,
      referringDomains: null,
      etv: null,
      source: "DataForSEO Google Organic SERP",
      locationCode: 2840,
      languageCode: "en",
    });
    expect(await getSerpAnalysis(input, customer)).toEqual(first);
    expect(state.live).toHaveBeenCalledTimes(1);
    await getSerpAnalysis({ ...input, projectId: "project-2" }, customer);
    expect(state.live).toHaveBeenCalledTimes(2);
  });
  it("rejects missing organic rank instead of creating synthetic rank zero", async () => {
    state.live.mockResolvedValue([
      { type: "organic", domain: "example.com", url: "https://example.com" },
    ]);
    await expect(getSerpAnalysis(input, customer)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });
});
