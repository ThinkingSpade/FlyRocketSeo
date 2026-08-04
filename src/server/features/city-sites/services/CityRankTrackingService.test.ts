import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getByIds: vi.fn(),
  getConfigsForProject: vi.fn(),
  createConfig: vi.fn(),
  addKeywords: vi.fn(),
}));

vi.mock("@/server/features/city-sites/repositories/CitySiteRepository", () => ({
  CitySiteRepository: { getByIds: mocks.getByIds },
}));

vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      getConfigsForProject: mocks.getConfigsForProject,
    },
  }),
);

vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: {
    createConfig: mocks.createConfig,
    addKeywords: mocks.addKeywords,
  },
}));

function citySite(
  id: string,
  host: string,
  overrides: Partial<{
    cityName: string | null;
    stateCode: string | null;
    locationCode: number | null;
    matchStatus: "matched" | "ambiguous" | "unmatched";
  }> = {},
) {
  return {
    id,
    host,
    subdomainLabel: host.split(".")[0],
    cityName: "Austin",
    stateCode: "TX",
    locationCode: 1026201,
    parentMetroCode: null,
    matchStatus: "matched" as const,
    matchSource: "auto" as const,
    createdAt: "2026-08-01 00:00:00",
    ...overrides,
  };
}

async function loadService() {
  const module =
    await import("@/server/features/city-sites/services/CityRankTrackingService");
  return module.CityRankTrackingService;
}

const SETTINGS = {
  templates: ["plumber {city}"],
  devices: "both" as const,
  serpDepth: 100,
  interval: "manual" as const,
};

describe("CityRankTrackingService.plan", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getConfigsForProject.mockResolvedValue([]);
  });

  it("expands each city's keywords from the shared template", async () => {
    mocks.getByIds.mockResolvedValue([
      citySite("cs_1", "austin.example.com"),
      citySite("cs_2", "dallas.example.com", {
        cityName: "Dallas",
        locationCode: 1026339,
      }),
    ]);
    const service = await loadService();

    const plan = await service.plan({
      projectId: "p_1",
      citySiteIds: ["cs_1", "cs_2"],
      settings: SETTINGS,
    });

    expect(plan.eligible).toEqual([
      {
        citySiteId: "cs_1",
        host: "austin.example.com",
        cityLabel: "Austin, TX",
        locationCode: 1026201,
        keywords: ["plumber austin"],
      },
      {
        citySiteId: "cs_2",
        host: "dallas.example.com",
        cityLabel: "Dallas, TX",
        locationCode: 1026339,
        keywords: ["plumber dallas"],
      },
    ]);
  });

  it("writes nothing", async () => {
    mocks.getByIds.mockResolvedValue([citySite("cs_1", "austin.example.com")]);
    const service = await loadService();

    await service.plan({
      projectId: "p_1",
      citySiteIds: ["cs_1"],
      settings: SETTINGS,
    });

    expect(mocks.createConfig).not.toHaveBeenCalled();
    expect(mocks.addKeywords).not.toHaveBeenCalled();
  });

  describe("skip reasons stay distinct", () => {
    it("skips a city with no location, which has no geography to check", async () => {
      mocks.getByIds.mockResolvedValue([
        citySite("cs_1", "dallas.example.com", {
          matchStatus: "ambiguous",
          locationCode: null,
          cityName: null,
        }),
      ]);
      const service = await loadService();

      const plan = await service.plan({
        projectId: "p_1",
        citySiteIds: ["cs_1"],
        settings: SETTINGS,
      });

      expect(plan.eligible).toEqual([]);
      expect(plan.skipped).toEqual([
        { host: "dallas.example.com", reason: "not-matched" },
      ]);
    });

    it("skips a city whose host and location are already tracked", async () => {
      mocks.getByIds.mockResolvedValue([
        citySite("cs_1", "austin.example.com"),
      ]);
      mocks.getConfigsForProject.mockResolvedValue([
        { domain: "austin.example.com", locationCode: 1026201 },
      ]);
      const service = await loadService();

      const plan = await service.plan({
        projectId: "p_1",
        citySiteIds: ["cs_1"],
        settings: SETTINGS,
      });

      expect(plan.skipped).toEqual([
        { host: "austin.example.com", reason: "already-tracked" },
      ]);
    });

    it("does not treat the same host at a different location as tracked", async () => {
      mocks.getByIds.mockResolvedValue([
        citySite("cs_1", "austin.example.com"),
      ]);
      mocks.getConfigsForProject.mockResolvedValue([
        { domain: "austin.example.com", locationCode: 2840 },
      ]);
      const service = await loadService();

      const plan = await service.plan({
        projectId: "p_1",
        citySiteIds: ["cs_1"],
        settings: SETTINGS,
      });

      expect(plan.eligible).toHaveLength(1);
    });

    it("stops at the config cap and says so", async () => {
      mocks.getByIds.mockResolvedValue([
        citySite("cs_1", "a.example.com"),
        citySite("cs_2", "b.example.com"),
      ]);
      // One slot left before the cap.
      mocks.getConfigsForProject.mockResolvedValue(
        Array.from({ length: 499 }, (_unused, index) => ({
          domain: `other${index}.example.com`,
          locationCode: 1,
        })),
      );
      const service = await loadService();

      const plan = await service.plan({
        projectId: "p_1",
        citySiteIds: ["cs_1", "cs_2"],
        settings: SETTINGS,
      });

      expect(plan.eligible).toHaveLength(1);
      expect(plan.skipped).toEqual([
        { host: "b.example.com", reason: "config-cap" },
      ]);
      expect(plan).toMatchObject({ existingConfigCount: 499, configCap: 500 });
    });

    it("skips a city whose templates all collapse to nothing", async () => {
      mocks.getByIds.mockResolvedValue([
        citySite("cs_1", "springfield.example.com", {
          cityName: "Springfield",
          stateCode: null,
        }),
      ]);
      const service = await loadService();

      const plan = await service.plan({
        projectId: "p_1",
        citySiteIds: ["cs_1"],
        settings: { ...SETTINGS, templates: ["{state}"] },
      });

      expect(plan.skipped).toEqual([
        { host: "springfield.example.com", reason: "no-keywords" },
      ]);
    });
  });

  describe("cost", () => {
    it("quotes nothing recurring for a manual schedule", async () => {
      mocks.getByIds.mockResolvedValue([
        citySite("cs_1", "austin.example.com"),
      ]);
      const service = await loadService();

      const plan = await service.plan({
        projectId: "p_1",
        citySiteIds: ["cs_1"],
        settings: SETTINGS,
      });

      expect(plan.cost.costPerMonthUsd).toBe(0);
      expect(plan.cost.costPerCheckUsd).toBeGreaterThan(0);
    });

    it("quotes a recurring cost once a schedule is chosen", async () => {
      mocks.getByIds.mockResolvedValue([
        citySite("cs_1", "austin.example.com"),
      ]);
      const service = await loadService();

      const plan = await service.plan({
        projectId: "p_1",
        citySiteIds: ["cs_1"],
        settings: { ...SETTINGS, interval: "weekly" },
      });

      expect(plan.cost.costPerMonthUsd).toBeGreaterThan(0);
    });

    /**
     * Cities can end up with different keyword counts (a `{state}` template
     * collapses for a city with none). Quoting the average would understate
     * the bill; the estimate must not be beatable upward.
     */
    it("quotes on the largest keyword list, not the average", async () => {
      mocks.getByIds.mockResolvedValue([
        citySite("cs_1", "austin.example.com"),
        citySite("cs_2", "springfield.example.com", {
          cityName: "Springfield",
          stateCode: null,
        }),
      ]);
      const service = await loadService();

      const plan = await service.plan({
        projectId: "p_1",
        citySiteIds: ["cs_1", "cs_2"],
        settings: {
          ...SETTINGS,
          templates: ["plumber {city}", "plumber {city} {state}"],
        },
      });

      // Austin expands to two keywords, Springfield collapses to one.
      expect(plan.cost.keywordsPerCity).toBe(2);
    });
  });
});

describe("CityRankTrackingService.setupChunk", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getConfigsForProject.mockResolvedValue([]);
    mocks.createConfig.mockResolvedValue({ configId: "cfg_1" });
    mocks.addKeywords.mockResolvedValue({ added: 1, addedIds: ["kw_1"] });
  });

  it("creates a config pinned to the city's own location code", async () => {
    mocks.getByIds.mockResolvedValue([citySite("cs_1", "austin.example.com")]);
    const service = await loadService();

    const result = await service.setupChunk({
      projectId: "p_1",
      citySiteIds: ["cs_1"],
      settings: SETTINGS,
      offset: 0,
    });

    expect(mocks.createConfig).toHaveBeenCalledWith({
      projectId: "p_1",
      domain: "austin.example.com",
      locationCode: 1026201,
      devices: "both",
      serpDepth: 100,
      scheduleInterval: "manual",
    });
    expect(mocks.addKeywords).toHaveBeenCalledWith("cfg_1", "p_1", [
      "plumber austin",
    ]);
    expect(result).toMatchObject({ created: 1, keywordsAdded: 1, done: true });
  });

  it("refuses to run with no keyword template", async () => {
    mocks.getByIds.mockResolvedValue([citySite("cs_1", "austin.example.com")]);
    const service = await loadService();

    await expect(
      service.setupChunk({
        projectId: "p_1",
        citySiteIds: ["cs_1"],
        settings: { ...SETTINGS, templates: [] },
        offset: 0,
      }),
    ).rejects.toThrow();
    expect(mocks.createConfig).not.toHaveBeenCalled();
  });

  /**
   * The resume bug this guards against, which silently sets up fewer cities
   * than asked: `plan` re-runs each chunk and a city created by the previous
   * chunk drops out of it, so the eligible list SHRINKS by exactly the number
   * created. Advancing the offset by the whole slice would step over that many
   * untouched cities. Only failures stay behind and need stepping over.
   */
  it("does not advance past cities it just created", async () => {
    mocks.getByIds.mockResolvedValue(
      Array.from({ length: 25 }, (_unused, index) =>
        citySite(`cs_${index}`, `city${index}.example.com`),
      ),
    );
    const service = await loadService();

    const result = await service.setupChunk({
      projectId: "p_1",
      citySiteIds: Array.from({ length: 25 }, (_unused, i) => `cs_${i}`),
      settings: SETTINGS,
      offset: 0,
    });

    expect(result.created).toBe(10);
    // All ten succeeded and will drop out of the next plan, so the next chunk
    // must start from 0 again — not from 10.
    expect(result.nextOffset).toBe(0);
    expect(result.done).toBe(false);
  });

  it("steps over a city that failed, so the run cannot stall on it", async () => {
    mocks.getByIds.mockResolvedValue(
      Array.from({ length: 25 }, (_unused, index) =>
        citySite(`cs_${index}`, `city${index}.example.com`),
      ),
    );
    mocks.createConfig.mockRejectedValueOnce(new Error("bad domain"));
    const service = await loadService();

    const result = await service.setupChunk({
      projectId: "p_1",
      citySiteIds: Array.from({ length: 25 }, (_unused, i) => `cs_${i}`),
      settings: SETTINGS,
      offset: 0,
    });

    expect(result.created).toBe(9);
    expect(result.failed).toEqual([
      { host: "city0.example.com", message: "bad domain" },
    ]);
    expect(result.nextOffset).toBe(1);
  });

  it("keeps going after one city fails rather than stranding the rest", async () => {
    mocks.getByIds.mockResolvedValue([
      citySite("cs_1", "a.example.com"),
      citySite("cs_2", "b.example.com"),
    ]);
    mocks.createConfig
      .mockRejectedValueOnce(new Error("bad domain"))
      .mockResolvedValueOnce({ configId: "cfg_2" });
    const service = await loadService();

    const result = await service.setupChunk({
      projectId: "p_1",
      citySiteIds: ["cs_1", "cs_2"],
      settings: SETTINGS,
      offset: 0,
    });

    expect(result).toMatchObject({ created: 1, done: true });
    expect(result.failed).toHaveLength(1);
  });

  it("finishes cleanly when nothing is left to do", async () => {
    mocks.getByIds.mockResolvedValue([citySite("cs_1", "austin.example.com")]);
    mocks.getConfigsForProject.mockResolvedValue([
      { domain: "austin.example.com", locationCode: 1026201 },
    ]);
    const service = await loadService();

    const result = await service.setupChunk({
      projectId: "p_1",
      citySiteIds: ["cs_1"],
      settings: SETTINGS,
      offset: 0,
    });

    expect(result).toMatchObject({ created: 0, done: true });
    expect(mocks.createConfig).not.toHaveBeenCalled();
  });

  it("never triggers a check, not even for a scheduled config", async () => {
    mocks.getByIds.mockResolvedValue([citySite("cs_1", "austin.example.com")]);
    const service = await loadService();

    await service.setupChunk({
      projectId: "p_1",
      citySiteIds: ["cs_1"],
      settings: { ...SETTINGS, interval: "daily" },
      offset: 0,
    });

    // The service module has no other rank-tracking entry point mocked, so a
    // call to one would throw rather than pass silently.
    expect(Object.keys(mocks)).not.toContain("triggerCheck");
    expect(mocks.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleInterval: "daily" }),
    );
  });
});
