import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Orchestration-level tests for `getCompetitors`.
 *
 * Everything pure (resolveDiscoveryMode, buildCompetitorSeed,
 * rankSerpCompetitors, applyProjectCompetitors, toDimensionRows) runs for
 * real; only the I/O boundaries are mocked: GSC, the two repositories, the
 * DataForSEO client, the R2 cache, and AnalysisRunService. Mocking pattern
 * matches SerpOverviewService.test.ts and RankTrackingService.test.ts (the
 * existing precedent for service-level tests in this codebase): one
 * `vi.hoisted` bag of `vi.fn()`s, one `vi.mock` per module wiring the
 * relevant subset into that module's real shape, dynamic `import()` of the
 * module under test inside each `it()` after `vi.resetModules()`.
 *
 * The single most important property under test here is which vendor
 * function gets called -- `serpCompetitors` (metered) vs `domainCompetitors`
 * (also metered, but a different, cheaper call) must be mutually exclusive
 * per request. Asserting on the mock call, not just on the returned shape,
 * is what actually pins that down: a test that only checked
 * `result.discoveryMode` would pass even if both vendor calls fired.
 */

const mocks = vi.hoisted(() => ({
  buildCacheKey: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
  record: vi.fn(),
  getConnection: vi.fn(),
  getPerformance: vi.fn(),
  getByProject: vi.fn(),
  listByProject: vi.fn(),
  domainCompetitors: vi.fn(),
  serpCompetitors: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: mocks.buildCacheKey,
  getCached: mocks.getCached,
  setCached: mocks.setCached,
}));
vi.mock("@/server/features/analysis-runs/services/analysisRuns", () => ({
  AnalysisRunService: { record: mocks.record },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: {
    getConnection: mocks.getConnection,
    getPerformance: mocks.getPerformance,
  },
}));
vi.mock(
  "@/server/features/profiles/repositories/ProjectProfileRepository",
  () => ({
    ProjectProfileRepository: { getByProject: mocks.getByProject },
  }),
);
vi.mock(
  "@/server/features/competitors/repositories/ProjectCompetitorRepository",
  () => ({
    ProjectCompetitorRepository: { listByProject: mocks.listByProject },
  }),
);
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    competitors: {
      domainCompetitors: mocks.domainCompetitors,
      serpCompetitors: mocks.serpCompetitors,
    },
  }),
}));

const billingCustomer = {
  organizationId: "org_1",
  userEmail: "test@example.com",
  userId: "user_1",
};

const input = {
  projectId: "project_1",
  target: "americavending.com",
  locationCode: 2840,
  languageCode: "en",
  excludeTopDomains: true,
  page: 1,
  pageSize: 25,
};

/** A GSC query-dimension row, matching what toDimensionRows reads. */
function gscRow(query: string, impressions: number, position: number) {
  return {
    keys: [query],
    clicks: 1,
    impressions,
    ctr: impressions > 0 ? 1 / impressions : 0,
    position,
  };
}

/** MIN_COMPETITOR_SEED is 5 -- 6 distinct contested queries clears it. */
function seedClearingGscRows() {
  return Array.from({ length: 6 }, (_, i) => gscRow(`keyword ${i}`, 100, 10));
}

function domainItem(domain: string) {
  return {
    domain,
    avg_position: 12.5,
    intersections: 40,
    full_domain_metrics: { organic: { count: 100, etv: 500 } },
  };
}

function serpItem(domain: string, positions: Record<string, number[]>) {
  return {
    domain,
    avg_position: 5,
    keywords_count: Object.keys(positions).length,
    etv: 300,
    keywords_positions: positions,
  };
}

function override(domain: string, status: "pinned" | "excluded") {
  return {
    id: `id-${domain}`,
    projectId: "project_1",
    domain,
    status,
    note: "",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
}

describe("CompetitorsService.getCompetitors", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.buildCacheKey.mockResolvedValue("cache-key");
    mocks.getCached.mockResolvedValue(null);
    mocks.setCached.mockResolvedValue(undefined);
    mocks.record.mockResolvedValue(undefined);
    mocks.getConnection.mockResolvedValue(null);
    mocks.getPerformance.mockRejectedValue(new Error("not connected"));
    mocks.getByProject.mockResolvedValue(null);
    mocks.listByProject.mockResolvedValue([]);
    mocks.domainCompetitors.mockResolvedValue({ items: [], totalCount: 0 });
    mocks.serpCompetitors.mockResolvedValue({ items: [], totalCount: 0 });
  });

  it("falls back to domain mode and still returns a valid page when the GSC pull throws", async () => {
    mocks.getConnection.mockResolvedValue({ id: "conn_1" });
    mocks.getPerformance.mockRejectedValue(new Error("revoked grant"));
    mocks.domainCompetitors.mockResolvedValue({
      items: [domainItem("rival.com")],
      totalCount: 1,
    });
    const { CompetitorsService } = await import("./CompetitorsService");

    const result = await CompetitorsService.getCompetitors(
      input,
      billingCustomer,
    );

    expect(result.discoveryMode).toBe("domain");
    expect(result.rows.map((r) => r.domain)).toEqual(["rival.com"]);
    expect(mocks.domainCompetitors).toHaveBeenCalledTimes(1);
    expect(mocks.serpCompetitors).not.toHaveBeenCalled();
  });

  it("calls serpCompetitors, not domainCompetitors, once the seed clears the floor", async () => {
    mocks.getConnection.mockResolvedValue({ id: "conn_1" });
    mocks.getPerformance.mockResolvedValue({ rows: seedClearingGscRows() });
    mocks.serpCompetitors.mockResolvedValue({
      items: [serpItem("rival.com", { "keyword 0": [3] })],
      totalCount: 1,
    });
    const { CompetitorsService } = await import("./CompetitorsService");

    const result = await CompetitorsService.getCompetitors(
      input,
      billingCustomer,
    );

    expect(result.discoveryMode).toBe("serp");
    expect(result.seedSize).toBe(6);
    expect(mocks.serpCompetitors).toHaveBeenCalledTimes(1);
    expect(mocks.serpCompetitors).toHaveBeenCalledWith(
      expect.objectContaining({ itemTypes: ["organic"] }),
    );
    expect(mocks.domainCompetitors).not.toHaveBeenCalled();
  });

  it("falls back to domain mode when the seed is below the floor, even though GSC is connected", async () => {
    mocks.getConnection.mockResolvedValue({ id: "conn_1" });
    mocks.getPerformance.mockResolvedValue({
      rows: [gscRow("keyword a", 100, 10), gscRow("keyword b", 50, 8)],
    });
    mocks.domainCompetitors.mockResolvedValue({
      items: [domainItem("rival.com")],
      totalCount: 1,
    });
    const { CompetitorsService } = await import("./CompetitorsService");

    const result = await CompetitorsService.getCompetitors(
      input,
      billingCustomer,
    );

    expect(result.discoveryMode).toBe("domain");
    expect(mocks.domainCompetitors).toHaveBeenCalledTimes(1);
    expect(mocks.serpCompetitors).not.toHaveBeenCalled();
  });

  it("applies pin/exclude overrides on the serp path", async () => {
    mocks.getConnection.mockResolvedValue({ id: "conn_1" });
    mocks.getPerformance.mockResolvedValue({ rows: seedClearingGscRows() });
    mocks.listByProject.mockResolvedValue([
      override("excluded-rival.com", "excluded"),
      override("pinned-not-found.com", "pinned"),
    ]);
    mocks.serpCompetitors.mockResolvedValue({
      items: [
        serpItem("excluded-rival.com", { "keyword 0": [2] }),
        serpItem("kept-rival.com", { "keyword 0": [4] }),
      ],
      totalCount: 2,
    });
    const { CompetitorsService } = await import("./CompetitorsService");

    const result = await CompetitorsService.getCompetitors(
      input,
      billingCustomer,
    );

    const domains = result.rows.map((r) => r.domain);
    expect(domains).not.toContain("excluded-rival.com");
    expect(domains).toContain("kept-rival.com");
    const pinnedRow = result.rows.find(
      (r) => r.domain === "pinned-not-found.com",
    );
    expect(pinnedRow?.pinned).toBe(true);
    expect(result.hiddenCount).toBe(1);
  });

  it("applies pin/exclude overrides on the domain path", async () => {
    // Default beforeEach state: getConnection -> null, getPerformance ->
    // rejects. Exercises the fallback path exactly as a disconnected project
    // would.
    mocks.listByProject.mockResolvedValue([
      override("excluded-rival.com", "excluded"),
      override("pinned-not-found.com", "pinned"),
    ]);
    mocks.domainCompetitors.mockResolvedValue({
      items: [domainItem("excluded-rival.com"), domainItem("kept-rival.com")],
      totalCount: 2,
    });
    const { CompetitorsService } = await import("./CompetitorsService");

    const result = await CompetitorsService.getCompetitors(
      input,
      billingCustomer,
    );

    expect(result.discoveryMode).toBe("domain");
    const domains = result.rows.map((r) => r.domain);
    expect(domains).not.toContain("excluded-rival.com");
    expect(domains).toContain("kept-rival.com");
    const pinnedRow = result.rows.find(
      (r) => r.domain === "pinned-not-found.com",
    );
    expect(pinnedRow?.pinned).toBe(true);
    expect(result.hiddenCount).toBe(1);
  });

  it("includes the GSC connection state in the cache key, so a domain-mode result cached before connecting cannot be served back after connecting", async () => {
    // Default beforeEach state: not connected.
    mocks.domainCompetitors.mockResolvedValue({ items: [], totalCount: 0 });
    const { CompetitorsService } = await import("./CompetitorsService");

    await CompetitorsService.getCompetitors(input, billingCustomer);

    expect(mocks.buildCacheKey).toHaveBeenCalledWith(
      "competitors:list",
      expect.objectContaining({ hasGscConnection: false }),
    );
  });
});
