import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  fetchRows: vi.fn(),
  upsert: vi.fn(),
  record: vi.fn(),
  cache: new Map<string, unknown>(),
}));
vi.mock("./research-data", () => ({
  RELATED_KEYWORDS_DEPTH: 1,
  fetchResearchRowsBySource: state.fetchRows,
  fetchGoogleAdsResearchRows: state.fetchRows,
}));
vi.mock(
  "@/server/features/keywords/repositories/KeywordResearchRepository",
  () => ({ KeywordResearchRepository: { upsertKeywordMetric: state.upsert } }),
);
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: { record: state.record },
}));
vi.mock("@/server/lib/r2-cache", () => ({
  CACHE_TTL: { researchResult: 100 },
  buildCacheKey: async (prefix: string, params: unknown) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => state.cache.get(key),
  setCached: async (key: string, value: unknown) => {
    state.cache.set(key, value);
  },
}));
import { research } from "./research";
import { keywordResearchResultSchema } from "@/types/schemas/keywords";
const input = {
  projectId: "p1",
  keywords: ["seo"],
  locationCode: 2840,
  languageCode: "en",
  resultLimit: 150 as const,
  mode: "suggestions" as const,
  clickstream: false,
};
const billing = {
  organizationId: "org1",
  userId: "u1",
  userEmail: "u@example.com",
};
const row = {
  keyword: "seo",
  searchVolume: 0,
  cpc: 0,
  competition: null,
  keywordDifficulty: null,
  intent: "unknown" as const,
  trend: [
    { year: 2026, month: 1, searchVolume: null },
    { year: 2026, month: 2, searchVolume: 0 },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  state.cache.clear();
  state.fetchRows.mockResolvedValue([row]);
});
describe("Keyword research capture and cache contracts", () => {
  it("persists full captured provider/market provenance and original capture date", async () => {
    const result = await research(input, billing);
    expect(result).toMatchObject({
      contractVersion: 2,
      dataSource: "DataForSEO Labs",
      scope: {
        projectId: "p1",
        seedKeyword: "seo",
        locationCode: 2840,
        languageCode: "en",
        clickstream: false,
      },
    });
    expect(keywordResearchResultSchema.parse(result).rows[0].trend).toEqual(
      row.trend,
    );
    const again = await research(input, billing);
    expect(again).toEqual(result);
    expect(state.fetchRows).toHaveBeenCalledTimes(1);
    await research({ ...input, projectId: "p2" }, billing);
    await research(input, { ...billing, organizationId: "org2" });
    expect(state.fetchRows).toHaveBeenCalledTimes(3);
  });
  it("records and restores successful empty observations without another paid fetch", async () => {
    state.fetchRows.mockResolvedValue([]);
    await research(input, billing);
    await research(input, billing);
    expect(state.fetchRows).toHaveBeenCalledTimes(1);
    expect(state.record).toHaveBeenCalledTimes(2);
  });
  it("restores useful legacy rows without certifying synthesized trend zeros", () => {
    const parsed = keywordResearchResultSchema.parse({
      rows: [{ ...row, trend: [{ year: 2026, month: 1, searchVolume: 0 }] }],
      source: "suggestions",
      usedFallback: false,
      diagnostics: {
        requestedMode: "suggestions",
        threshold: 3,
        sourceAttempts: [],
      },
    });
    expect(parsed.contractVersion).toBe(1);
    expect(parsed.fetchedAt).toBeNull();
    expect(parsed.rows[0].searchVolume).toBe(0);
    expect(parsed.rows[0].trend).toEqual([]);
  });
});
