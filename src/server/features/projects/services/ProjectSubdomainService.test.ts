import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    listForProject: vi.fn(),
    countForProject: vi.fn(),
    getByHost: vi.fn(),
    insert: vi.fn(),
    insertMany: vi.fn(),
    refreshMetricsMany: vi.fn(),
    removeMany: vi.fn(),
    setActiveMany: vi.fn(),
  },
  getProjectForOrganization: vi.fn(),
  getAnalyticsPerformance: vi.fn(),
  rankedKeywords: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    domain: { rankedKeywords: mocks.rankedKeywords },
  }),
}));
vi.mock(
  "@/server/features/projects/repositories/ProjectSubdomainRepository",
  () => ({ ProjectSubdomainRepository: mocks.repository }),
);
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/rank-tracking/rankTrackingTimestamps", () => ({
  toStoredTimestamp: () => "2026-08-06 00:00:00",
}));

/** Stands in for the real classifier: any error carrying a `gscReason` is a
 *  connection/permission problem, anything else is a real fault to rethrow. */
class GscFailure extends Error {
  constructor(readonly gscReason: string) {
    super(`gsc ${gscReason}`);
  }
}

vi.mock("@/server/features/gsc/services/GscService", () => ({
  classifyGscAccessFailure: (error: unknown) =>
    error instanceof GscFailure ? error.gscReason : null,
  GscService: { getAnalyticsPerformance: mocks.getAnalyticsPerformance },
}));

function gscFailure(reason: string) {
  return new GscFailure(reason);
}

const ORG = "org_1";
const PROJECT = {
  id: "project_1",
  name: "Acme",
  domain: "example.com",
  locationCode: 2840,
  languageCode: "en",
};
const BILLING = { organizationId: ORG, userId: "user_1", userEmail: "a@b.c" };

function gscPull(
  rows: Array<{ keys: string[]; clicks: number; impressions: number }>,
) {
  return { rows, request: { rowLimit: 5000 } };
}

function rankedPull(items: Array<{ url: string; etv: number }>) {
  return {
    items: items.map(({ url, etv }) => ({
      ranked_serp_element: { serp_item: { url, etv } },
    })),
    totalCount: items.length,
  };
}

async function importService() {
  const module = await import("./ProjectSubdomainService");
  return module.ProjectSubdomainService;
}

describe("ProjectSubdomainService.discoverSubdomains", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks.repository)) mock.mockReset();
    mocks.getProjectForOrganization.mockReset();
    mocks.getAnalyticsPerformance.mockReset();
    mocks.rankedKeywords.mockReset();

    mocks.getProjectForOrganization.mockResolvedValue(PROJECT);
    mocks.repository.insertMany.mockResolvedValue(undefined);
    mocks.repository.refreshMetricsMany.mockResolvedValue(undefined);
  });

  it("inserts newly found hosts with the source that found them first", async () => {
    mocks.repository.listForProject.mockResolvedValue([]);
    mocks.getAnalyticsPerformance.mockResolvedValue(
      gscPull([
        { keys: ["https://blog.example.com/a"], clicks: 8, impressions: 150 },
      ]),
    );
    mocks.rankedKeywords.mockResolvedValue(
      rankedPull([
        // Also seen by GSC: keeps the `gsc` provenance, gains organic metrics.
        { url: "https://blog.example.com/a", etv: 12 },
        { url: "https://shop.example.com/x", etv: 3 },
      ]),
    );

    const service = await importService();
    const result = await service.discoverSubdomains(
      ORG,
      { projectId: PROJECT.id, sources: ["gsc", "dataforseo"] },
      BILLING,
    );

    expect(result.found).toBe(2);
    expect(result.added).toBe(2);
    expect(result.refreshed).toBe(0);

    expect(mocks.repository.insertMany).toHaveBeenCalledWith(PROJECT.id, [
      {
        host: "blog.example.com",
        source: "gsc",
        metrics: {
          clicks: 8,
          impressions: 150,
          organicKeywords: 1,
          organicTraffic: 12,
        },
        lastSeenAt: "2026-08-06 00:00:00",
      },
      {
        host: "shop.example.com",
        source: "dataforseo",
        metrics: {
          clicks: null,
          impressions: null,
          organicKeywords: 1,
          organicTraffic: 3,
        },
        lastSeenAt: "2026-08-06 00:00:00",
      },
    ]);
  });

  it("refreshes hosts it already has instead of re-inserting them", async () => {
    mocks.repository.listForProject.mockResolvedValue([
      {
        id: "sub_1",
        projectId: PROJECT.id,
        host: "blog.example.com",
        source: "manual",
        isActive: false,
        organicKeywords: null,
        organicTraffic: null,
        clicks: null,
        impressions: null,
        lastSeenAt: null,
        createdAt: "2026-01-01 00:00:00",
      },
    ]);
    mocks.getAnalyticsPerformance.mockResolvedValue(gscPull([]));
    mocks.rankedKeywords.mockResolvedValue(
      rankedPull([{ url: "https://blog.example.com/a", etv: 12 }]),
    );

    const service = await importService();
    const result = await service.discoverSubdomains(
      ORG,
      { projectId: PROJECT.id, sources: ["gsc", "dataforseo"] },
      BILLING,
    );

    expect(result.added).toBe(0);
    expect(result.refreshed).toBe(1);
    expect(mocks.repository.insertMany).toHaveBeenCalledWith(PROJECT.id, []);
    // A re-run must not resurrect an exclusion or overwrite manual provenance,
    // so the refresh carries metrics only.
    expect(mocks.repository.refreshMetricsMany).toHaveBeenCalledWith(
      PROJECT.id,
      [
        {
          id: "sub_1",
          metrics: {
            clicks: null,
            impressions: null,
            organicKeywords: 1,
            organicTraffic: 12,
          },
          lastSeenAt: "2026-08-06 00:00:00",
        },
      ],
    );
  });

  it("warns instead of failing when Search Console is not connected", async () => {
    mocks.repository.listForProject.mockResolvedValue([]);
    mocks.getAnalyticsPerformance.mockRejectedValue(
      gscFailure("not_connected"),
    );
    mocks.rankedKeywords.mockResolvedValue(
      rankedPull([{ url: "https://shop.example.com/x", etv: 3 }]),
    );

    const service = await importService();
    const result = await service.discoverSubdomains(
      ORG,
      { projectId: PROJECT.id, sources: ["gsc", "dataforseo"] },
      BILLING,
    );

    expect(result.added).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Search Console isn't connected");
  });

  it("still runs the paid pass when the Search Console grant is stale", async () => {
    // The whole point of degrading GSC failures: a run that already spent
    // credits must not come back empty because the free source had a bad token.
    mocks.repository.listForProject.mockResolvedValue([]);
    mocks.getAnalyticsPerformance.mockRejectedValue(
      gscFailure("requires_reconnect"),
    );
    mocks.rankedKeywords.mockResolvedValue(
      rankedPull([{ url: "https://shop.example.com/x", etv: 3 }]),
    );

    const service = await importService();
    const result = await service.discoverSubdomains(
      ORG,
      { projectId: PROJECT.id, sources: ["gsc", "dataforseo"] },
      BILLING,
    );

    expect(result.added).toBe(1);
    expect(result.warnings[0]).toContain("needs reconnecting");
  });

  it("rethrows a Search Console fault that is not a connection problem", async () => {
    mocks.repository.listForProject.mockResolvedValue([]);
    // No `gscReason`: a 5xx or transport failure, which must not be reported as
    // a skipped source.
    mocks.getAnalyticsPerformance.mockRejectedValue(new Error("gsc 503"));

    const service = await importService();
    await expect(
      service.discoverSubdomains(
        ORG,
        { projectId: PROJECT.id, sources: ["gsc", "dataforseo"] },
        BILLING,
      ),
    ).rejects.toThrow("gsc 503");
  });

  it("never bills DataForSEO when only the free source was requested", async () => {
    mocks.repository.listForProject.mockResolvedValue([]);
    mocks.getAnalyticsPerformance.mockResolvedValue(
      gscPull([
        { keys: ["https://blog.example.com/a"], clicks: 8, impressions: 150 },
      ]),
    );

    const service = await importService();
    await service.discoverSubdomains(
      ORG,
      { projectId: PROJECT.id, sources: ["gsc"] },
      BILLING,
    );

    expect(mocks.rankedKeywords).not.toHaveBeenCalled();
  });

  it("stops inserting at the per-project cap and reports the remainder", async () => {
    const { MAX_SUBDOMAINS_PER_PROJECT } =
      await import("@/shared/project-subdomains");
    mocks.repository.listForProject.mockResolvedValue(
      Array.from({ length: MAX_SUBDOMAINS_PER_PROJECT }, (_, i) => ({
        id: `sub_${i}`,
        projectId: PROJECT.id,
        host: `host${i}.example.com`,
        source: "dataforseo" as const,
        isActive: true,
        organicKeywords: null,
        organicTraffic: null,
        clicks: null,
        impressions: null,
        lastSeenAt: null,
        createdAt: "2026-01-01 00:00:00",
      })),
    );
    mocks.getAnalyticsPerformance.mockResolvedValue(gscPull([]));
    mocks.rankedKeywords.mockResolvedValue(
      rankedPull([{ url: "https://brand-new.example.com/x", etv: 3 }]),
    );

    const service = await importService();
    const result = await service.discoverSubdomains(
      ORG,
      { projectId: PROJECT.id, sources: ["gsc", "dataforseo"] },
      BILLING,
    );

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mocks.repository.insertMany).toHaveBeenCalledWith(PROJECT.id, []);
    expect(result.warnings.some((w) => w.includes("limit"))).toBe(true);
  });

  it("refuses to run when the project has no domain to scope hosts against", async () => {
    mocks.getProjectForOrganization.mockResolvedValue({
      ...PROJECT,
      domain: null,
    });

    const service = await importService();
    await expect(
      service.discoverSubdomains(
        ORG,
        { projectId: PROJECT.id, sources: ["gsc", "dataforseo"] },
        BILLING,
      ),
    ).rejects.toThrow(/domain/i);
    expect(mocks.rankedKeywords).not.toHaveBeenCalled();
  });
});

describe("ProjectSubdomainService.addSubdomain", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks.repository)) mock.mockReset();
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue(PROJECT);
    mocks.repository.getByHost.mockResolvedValue(null);
    mocks.repository.countForProject.mockResolvedValue(0);
  });

  it("normalizes a pasted URL down to its host", async () => {
    mocks.repository.insert.mockImplementation(
      (input: { host: string; source: string }) => ({
        id: "sub_new",
        projectId: PROJECT.id,
        isActive: true,
        organicKeywords: null,
        organicTraffic: null,
        clicks: null,
        impressions: null,
        lastSeenAt: null,
        createdAt: "2026-08-06 00:00:00",
        ...input,
      }),
    );

    const service = await importService();
    const created = await service.addSubdomain(ORG, {
      projectId: PROJECT.id,
      host: "https://Blog.Example.com/posts",
    });

    expect(created.host).toBe("blog.example.com");
    expect(created.source).toBe("manual");
  });

  it("rejects a host that is not under the project's domain", async () => {
    const service = await importService();
    await expect(
      service.addSubdomain(ORG, {
        projectId: PROJECT.id,
        host: "blog.someoneelse.com",
      }),
    ).rejects.toThrow(/not a subdomain of example\.com/);
    expect(mocks.repository.insert).not.toHaveBeenCalled();
  });

  it("rejects a duplicate before writing", async () => {
    mocks.repository.getByHost.mockResolvedValue({ id: "sub_1" });

    const service = await importService();
    await expect(
      service.addSubdomain(ORG, {
        projectId: PROJECT.id,
        host: "blog.example.com",
      }),
    ).rejects.toThrow(/already on this project/);
    expect(mocks.repository.insert).not.toHaveBeenCalled();
  });
});
