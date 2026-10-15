import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchCitiesByNames: vi.fn(),
  count: vi.fn(),
  getByCode: vi.fn(),
  findExistingHosts: vi.fn(),
  insertMany: vi.fn(),
  setLocation: vi.fn(),
  listAllHosts: vi.fn(),
  getAnalyticsPerformance: vi.fn(),
}));

vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getAnalyticsPerformance: mocks.getAnalyticsPerformance },
  // Mirrors the real helper's contract: classify what it can, rethrow the rest.
  toGscUnavailable: (error: unknown) => {
    if (error instanceof Error && error.name === "GscNotConnectedError") {
      return { connected: false, reason: "not_connected" };
    }
    throw error;
  },
}));

vi.mock("@/server/features/geo/repositories/GeoLocationRepository", () => ({
  GeoLocationRepository: {
    searchCitiesByNames: mocks.searchCitiesByNames,
    count: mocks.count,
    getByCode: mocks.getByCode,
  },
}));

vi.mock("@/server/features/city-sites/repositories/CitySiteRepository", () => ({
  CitySiteRepository: {
    findExistingHosts: mocks.findExistingHosts,
    insertMany: mocks.insertMany,
    setLocation: mocks.setLocation,
    listAllHosts: mocks.listAllHosts,
  },
}));

async function loadService() {
  const module =
    await import("@/server/features/city-sites/services/CitySiteService");
  return module.CitySiteService;
}

function gscRow(
  page: string,
  clicks: number,
  impressions: number,
  position: number,
) {
  return { keys: [page], clicks, impressions, position };
}

describe("CitySiteService.getPerformance", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.listAllHosts.mockResolvedValue(
      new Set(["austin.example.com", "dallas.example.com"]),
    );
  });

  it("rolls page rows up to one row per city site", async () => {
    mocks.getAnalyticsPerformance.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      rows: [
        gscRow("https://austin.example.com/a", 10, 100, 4),
        gscRow("https://austin.example.com/b", 5, 100, 8),
        gscRow("https://dallas.example.com/a", 3, 30, 9),
      ],
      request: { rowLimit: 5000 },
    });
    const service = await loadService();

    const result = await service.getPerformance({
      projectId: "p_1",
      dateRange: "last_28_days",
    });

    expect(result).toMatchObject({ connected: true, citiesWithData: 2 });
    if (!result.connected) throw new Error("expected connected");
    expect(result.hosts[0]).toMatchObject({
      host: "austin.example.com",
      clicks: 15,
      impressions: 200,
      position: 6,
    });
    expect(result.totals).toEqual({ clicks: 18, impressions: 230 });
  });

  /**
   * The reason the registry intersection exists: a Domain property reports the
   * apex and www alongside the cities, and counting those into a per-city
   * total would inflate every headline number with the main site's traffic.
   */
  it("excludes hosts that are not city sites", async () => {
    mocks.getAnalyticsPerformance.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      rows: [
        gscRow("https://example.com/", 5000, 90_000, 2),
        gscRow("https://www.example.com/", 900, 10_000, 3),
        gscRow("https://austin.example.com/a", 10, 100, 4),
      ],
      request: { rowLimit: 5000 },
    });
    const service = await loadService();

    const result = await service.getPerformance({
      projectId: "p_1",
      dateRange: "last_28_days",
    });

    if (!result.connected) throw new Error("expected connected");
    expect(result.hosts.map((host) => host.host)).toEqual([
      "austin.example.com",
    ]);
    expect(result.totals).toEqual({ clicks: 10, impressions: 100 });
  });

  it("ranks cities by clicks", async () => {
    mocks.getAnalyticsPerformance.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      rows: [
        gscRow("https://austin.example.com/a", 2, 10, 4),
        gscRow("https://dallas.example.com/a", 40, 10, 4),
      ],
      request: { rowLimit: 5000 },
    });
    const service = await loadService();

    const result = await service.getPerformance({
      projectId: "p_1",
      dateRange: "last_28_days",
    });

    if (!result.connected) throw new Error("expected connected");
    expect(result.hosts.map((host) => host.host)).toEqual([
      "dallas.example.com",
      "austin.example.com",
    ]);
  });

  it("flags a pull the ceiling cut short, so absence is not read as zero", async () => {
    mocks.getAnalyticsPerformance.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      rows: Array.from({ length: 5000 }, (_unused, index) =>
        gscRow(`https://austin.example.com/${index}`, 1, 1, 1),
      ),
      request: { rowLimit: 5000 },
    });
    const service = await loadService();

    const result = await service.getPerformance({
      projectId: "p_1",
      dateRange: "last_28_days",
    });

    expect(result).toMatchObject({ truncated: true, rowsExamined: 5000 });
  });

  it("degrades to a not-connected result instead of throwing", async () => {
    const notConnected = new Error("no connection");
    notConnected.name = "GscNotConnectedError";
    mocks.getAnalyticsPerformance.mockRejectedValue(notConnected);
    const service = await loadService();

    await expect(
      service.getPerformance({ projectId: "p_1", dateRange: "last_28_days" }),
    ).resolves.toEqual({ connected: false, reason: "not_connected" });
  });

  it("says a URL-prefix property cannot see city subdomains, rather than reporting zero", async () => {
    mocks.getAnalyticsPerformance.mockResolvedValue({
      siteUrl: "https://example.com/",
      rows: [
        {
          keys: ["https://example.com/"],
          clicks: 40,
          impressions: 900,
          ctr: 0.04,
          position: 3,
        },
      ],
      request: { rowLimit: 5000 },
    });
    const service = await loadService();

    await expect(
      service.getPerformance({ projectId: "p_1", dateRange: "last_28_days" }),
    ).resolves.toEqual({
      connected: false,
      reason: "url_prefix_property",
      siteUrl: "https://example.com/",
    });
  });

  it("asks Search Console for pages, not queries", async () => {
    mocks.getAnalyticsPerformance.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      rows: [],
      request: { rowLimit: 5000 },
    });
    const service = await loadService();

    await service.getPerformance({
      projectId: "p_1",
      dateRange: "last_7_days",
    });

    expect(mocks.getAnalyticsPerformance).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p_1", dimensions: ["page"] }),
    );
  });
});
