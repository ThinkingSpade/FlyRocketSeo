import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  domains: vi.fn(),
  gap: vi.fn(),
  links: vi.fn(),
  record: vi.fn(),
  cache: new Map<string, unknown>(),
  writeFails: false,
  connection: null as {
    id: string;
    siteUrl: string;
    connectedByUserId: string;
  } | null,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    competitors: { domainCompetitors: state.domains, keywordGap: state.gap },
    backlinks: { domainIntersection: state.links },
  }),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: async (prefix: string, params: unknown) =>
    `${prefix}:${JSON.stringify(params)}`,
  getCached: async (key: string) => state.cache.get(key),
  setCached: async (key: string, result: unknown) => {
    if (state.writeFails) throw new Error("fixture cache failure");
    state.cache.set(key, result);
  },
}));
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: { record: state.record },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: {
    getConnection: vi.fn(async () => state.connection),
    getAnalyticsPerformance: vi.fn(async () => {
      throw new Error("fixture no GSC");
    }),
  },
}));
vi.mock(
  "@/server/features/profiles/repositories/ProjectProfileRepository",
  () => ({
    ProjectProfileRepository: { getByProject: vi.fn(async () => null) },
  }),
);
vi.mock(
  "@/server/features/competitors/repositories/ProjectCompetitorRepository",
  () => ({
    ProjectCompetitorRepository: { listByProject: vi.fn(async () => []) },
  }),
);
import { CompetitorsService } from "./CompetitorsService";
const input = {
  projectId: "p1",
  target: "blog.example.com",
  competitor: "rival.com",
  locationCode: 2840,
  languageCode: "en",
  excludeTopDomains: true,
  page: 1,
  pageSize: 25,
  mode: "missing" as const,
};
const billing = {
  organizationId: "org",
  userId: "u1",
  userEmail: "test@example.com",
};
beforeEach(() => {
  vi.clearAllMocks();
  state.cache.clear();
  state.writeFails = false;
  state.connection = null;
  state.domains.mockResolvedValue({ items: [], totalCount: 0 });
  state.gap.mockResolvedValue({ items: [], totalCount: 0 });
  state.links.mockResolvedValue({ items: [], totalCount: 0 });
});
describe("Competitor mapped result contracts", () => {
  it("isolates the actual GSC property and connector identity", async () => {
    state.connection = {
      id: "connection-a",
      siteUrl: "sc-domain:blog.example.com",
      connectedByUserId: "connector-a",
    };
    await CompetitorsService.getCompetitors(input, billing);
    const keys = [...state.cache.keys()];
    expect(keys[0]).toContain(
      '"gscIdentity":{"id":"connection-a","siteUrl":"sc-domain:blog.example.com","connectedByUserId":"connector-a"}',
    );
    state.connection = { ...state.connection, siteUrl: "sc-domain:other.com" };
    await CompetitorsService.getCompetitors(input, billing);
    expect(state.domains).toHaveBeenCalledTimes(2);
  });
  it("returns paid evidence but never records a stale saved run when its cache write fails", async () => {
    state.writeFails = true;
    expect(
      await CompetitorsService.getCompetitors(input, billing),
    ).toMatchObject({ rows: [], totalCount: 0, provider: "DataForSEO Labs" });
    expect(state.record).not.toHaveBeenCalled();
    expect(state.domains).toHaveBeenCalledOnce();
  });
  it("retains original captures on gap cache hits and refuses foreign cached scope", async () => {
    const first = await CompetitorsService.getKeywordGap(input, billing);
    const second = await CompetitorsService.getKeywordGap(input, billing);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(state.gap).toHaveBeenCalledOnce();
    const key = [...state.cache.keys()][0];
    state.cache.set(key, {
      ...first,
      scope: { ...first.scope, locationCode: 2826 },
    });
    await CompetitorsService.getKeywordGap(input, billing);
    expect(state.gap).toHaveBeenCalledTimes(2);
  });
  it("continues paging a full provider page even when mapped domains are omitted", async () => {
    state.domains.mockResolvedValue({
      items: Array.from({ length: 25 }, () => ({ domain: null })),
      totalCount: null,
    });
    expect(
      await CompetitorsService.getCompetitors(input, billing),
    ).toMatchObject({ rows: [], hasMore: true, totalCount: null });
  });
  it("sanitizes domain observations and records source/captured target/market", async () => {
    state.domains.mockResolvedValue({
      items: [
        {
          domain: "rival.com",
          avg_position: 0,
          intersections: 1.5,
          full_domain_metrics: { organic: { count: -1, etv: 0.1234 } },
        },
      ],
      totalCount: 1,
    });
    const result = await CompetitorsService.getCompetitors(input, billing);
    expect(result.rows[0]).toMatchObject({
      avgPosition: null,
      intersections: null,
      organicKeywords: null,
      organicTraffic: 0.1234,
    });
    expect(result).toMatchObject({
      contractVersion: 2,
      provider: "DataForSEO Labs",
      scope: {
        projectId: "p1",
        target: "blog.example.com",
        locationCode: 2840,
        languageCode: "en",
      },
    });
  });
  it("reuses successful empty evidence and isolates organizations", async () => {
    await CompetitorsService.getCompetitors(input, billing);
    await CompetitorsService.getCompetitors(input, billing);
    expect(state.domains).toHaveBeenCalledOnce();
    expect(state.record).toHaveBeenCalledTimes(2);
    await CompetitorsService.getCompetitors(input, {
      ...billing,
      organizationId: "other",
    });
    expect(state.domains).toHaveBeenCalledTimes(2);
  });
  it("keeps gap unknowns distinct from zero and preserves swapped target ranks", async () => {
    state.gap.mockResolvedValue({
      items: [
        {
          keyword_data: {
            keyword: "seo",
            keyword_info: { search_volume: 0, cpc: -1, competition: 2 },
            keyword_properties: { keyword_difficulty: 101 },
          },
          first_domain_serp_element: { rank_absolute: 3 },
          second_domain_serp_element: { rank_absolute: 0 },
        },
      ],
      totalCount: 1.5,
    });
    const result = await CompetitorsService.getKeywordGap(input, billing);
    expect(result.rows[0]).toMatchObject({
      searchVolume: 0,
      cpc: null,
      competition: null,
      keywordDifficulty: null,
      targetRank: null,
      competitorRank: 3,
    });
    expect(result).toMatchObject({
      totalCount: null,
      source: "DataForSEO Labs",
      scope: {
        target: "blog.example.com",
        competitor: "rival.com",
        mode: "missing",
      },
    });
  });
  it("normalizes link gap scores/counts/dates without losing observed zero", async () => {
    state.links.mockResolvedValue({
      items: [
        {
          domain_intersection: {
            1: {
              target: "link.example.com",
              rank: 0,
              backlinks: 1.5,
              backlinks_spam_score: 101,
              first_seen: "2026-02-31",
            },
          },
        },
      ],
      totalCount: 1,
    });
    const result = await CompetitorsService.getLinkGap(input, billing);
    expect(result.rows[0]).toMatchObject({
      rank: 0,
      backlinksToCompetitor: null,
      spamScore: null,
      firstSeen: null,
    });
  });
});
