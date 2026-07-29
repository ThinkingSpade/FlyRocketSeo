import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  buildCacheKey: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
  serpLive: vi.fn(),
  trafficEstimation: vi.fn(),
  fetchKeywordMetricsForList: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: { record: mocks.record },
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: mocks.buildCacheKey,
  getCached: mocks.getCached,
  setCached: mocks.setCached,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    serp: { live: mocks.serpLive },
    competitors: { trafficEstimation: mocks.trafficEstimation },
  }),
}));
// Mocked so the "keyword stats" branch can be driven independently of the
// real Labs/Google Ads routing -- SerpOverviewService.ts loads this lazily
// (a dynamic import) specifically to keep the SDK out of startup, and
// vi.mock intercepts it the same way regardless of import style.
vi.mock("@/server/lib/dataforseo/keyword-metrics", () => ({
  fetchKeywordMetricsForList: mocks.fetchKeywordMetricsForList,
}));

const FAKE_SERP_ITEMS = [
  {
    type: "organic",
    rank_absolute: 1,
    rank_group: 1,
    domain: "example.com",
    title: "Example",
    url: "https://example.com",
    description: null,
    etv: 10,
  },
];

const billingCustomer = {
  organizationId: "org_1",
  userEmail: "test@example.com",
  userId: "user_1",
};

describe("SerpOverviewService.getSerpOverview", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.buildCacheKey.mockResolvedValue("cache-key");
    mocks.getCached.mockResolvedValue(null);
    mocks.setCached.mockResolvedValue(undefined);
    mocks.record.mockResolvedValue(undefined);
    mocks.serpLive.mockResolvedValue(FAKE_SERP_ITEMS);
    mocks.trafficEstimation.mockResolvedValue([
      { target: "example.com", metrics: { organic: { etv: 500 } } },
    ]);
    mocks.fetchKeywordMetricsForList.mockResolvedValue([
      {
        keyword: "office coffee service",
        searchVolume: 100,
        cpc: 1,
        keywordDifficulty: 20,
      },
    ]);
  });

  it("sends Labs the resolved country pair for a metro run, never the metro code (Defect 2 fix)", async () => {
    const { SerpOverviewService } = await import("./SerpOverviewService");

    await SerpOverviewService.getSerpOverview(
      {
        projectId: "project_1",
        keyword: "office coffee service",
        locationCode: 1_026_339, // DFW DMA -- the SERP/keyword-stats geography
        languageCode: "en",
        domainAnalyticsLocationCode: 2840, // US -- resolved client-side for Labs
        domainAnalyticsLanguageCode: "en",
      },
      billingCustomer,
    );

    expect(mocks.trafficEstimation).toHaveBeenCalledTimes(1);
    expect(mocks.trafficEstimation).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2840, languageCode: "en" }),
    );
    // The SERP call itself still legitimately gets the metro code.
    expect(mocks.serpLive).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 1_026_339 }),
    );
  });

  it("falls back to the plain locationCode with no confirmed area, unchanged from before this fix", async () => {
    const { SerpOverviewService } = await import("./SerpOverviewService");

    await SerpOverviewService.getSerpOverview(
      {
        projectId: "project_1",
        keyword: "office coffee service",
        locationCode: 2840,
        languageCode: "en",
      },
      billingCustomer,
    );

    expect(mocks.trafficEstimation).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2840, languageCode: "en" }),
    );
  });

  it("surfaces a Labs rejection as a structured flag instead of a silently swallowed console.warn", async () => {
    mocks.trafficEstimation.mockRejectedValue(new Error("Labs says no"));
    const { SerpOverviewService } = await import("./SerpOverviewService");

    const result = await SerpOverviewService.getSerpOverview(
      {
        projectId: "project_1",
        keyword: "office coffee service",
        locationCode: 1_026_339,
        languageCode: "en",
        domainAnalyticsLocationCode: 2840,
        domainAnalyticsLanguageCode: "en",
      },
      billingCustomer,
    );

    expect(result.domainTrafficUnavailable).toBe(true);
    expect(result.results[0]?.domainEtv).toBeNull();
    // The other enrichment must be unaffected by this one's failure.
    expect(result.keywordStatsUnavailable).toBe(false);
  });

  it("surfaces a keyword-stats provider failure as a structured flag instead of a silently swallowed console.warn", async () => {
    mocks.fetchKeywordMetricsForList.mockRejectedValue(
      new Error("Ads says no"),
    );
    const { SerpOverviewService } = await import("./SerpOverviewService");

    const result = await SerpOverviewService.getSerpOverview(
      {
        projectId: "project_1",
        keyword: "office coffee service",
        locationCode: 1_026_339,
        languageCode: "en",
      },
      billingCustomer,
    );

    expect(result.keywordStatsUnavailable).toBe(true);
    expect(result.keywordStats).toBeNull();
    expect(result.domainTrafficUnavailable).toBe(false);
  });

  it("never flags domain traffic as unavailable when there was simply nothing to enrich", async () => {
    mocks.serpLive.mockResolvedValue([]); // no organic results, no domains
    const { SerpOverviewService } = await import("./SerpOverviewService");

    const result = await SerpOverviewService.getSerpOverview(
      {
        projectId: "project_1",
        keyword: "office coffee service",
        locationCode: 2840,
        languageCode: "en",
      },
      billingCustomer,
    );

    expect(result.domainTrafficUnavailable).toBe(false);
    expect(mocks.trafficEstimation).not.toHaveBeenCalled();
  });
});
