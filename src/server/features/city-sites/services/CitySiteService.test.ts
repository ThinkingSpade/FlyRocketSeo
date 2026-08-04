import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchCitiesByNames: vi.fn(),
  count: vi.fn(),
  getByCode: vi.fn(),
  findExistingHosts: vi.fn(),
  insertMany: vi.fn(),
  setLocation: vi.fn(),
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
  },
}));

const AUSTIN_TX = {
  code: 1026201,
  name: "Austin,Texas,United States",
  type: "City",
  stateCode: "TX",
  countryCode: 2840,
  parentMetroCode: 200635,
};
const AUSTIN_MN = {
  code: 1024000,
  name: "Austin,Minnesota,United States",
  type: "City",
  stateCode: "MN",
  countryCode: 2840,
  parentMetroCode: null,
};
const ST_LOUIS = {
  code: 1025062,
  name: "St. Louis,Missouri,United States",
  type: "City",
  stateCode: "MO",
  countryCode: 2840,
  parentMetroCode: null,
};

async function loadService() {
  const module =
    await import("@/server/features/city-sites/services/CitySiteService");
  return module.CitySiteService;
}

const PROJECT = { projectId: "p_1", projectDomain: "example.com" };

describe("CitySiteService.previewImport", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.findExistingHosts.mockResolvedValue(new Set());
    mocks.count.mockResolvedValue(50_000);
    mocks.searchCitiesByNames.mockResolvedValue([]);
  });

  it("pins a uniquely-named city and carries its metro through", async () => {
    mocks.searchCitiesByNames.mockResolvedValue([ST_LOUIS, AUSTIN_TX]);
    const service = await loadService();

    const preview = await service.previewImport({
      ...PROJECT,
      text: "austin.example.com",
    });

    expect(preview.rows).toEqual([
      {
        host: "austin.example.com",
        subdomainLabel: "austin",
        cityName: "Austin",
        stateCode: "TX",
        locationCode: 1026201,
        parentMetroCode: 200635,
        matchStatus: "matched",
        alreadyImported: false,
      },
    ]);
    expect(preview.counts).toEqual({
      matched: 1,
      ambiguous: 0,
      unmatched: 0,
    });
  });

  it("stores no location code when two states share the city name", async () => {
    mocks.searchCitiesByNames.mockResolvedValue([AUSTIN_TX, AUSTIN_MN]);
    const service = await loadService();

    const preview = await service.previewImport({
      ...PROJECT,
      text: "austin.example.com",
    });

    expect(preview.rows[0]).toMatchObject({
      matchStatus: "ambiguous",
      locationCode: null,
      cityName: null,
    });
  });

  it("resolves the same tie when the host names the state", async () => {
    mocks.searchCitiesByNames.mockResolvedValue([AUSTIN_TX, AUSTIN_MN]);
    const service = await loadService();

    const preview = await service.previewImport({
      ...PROJECT,
      text: "austin-mn.example.com",
    });

    expect(preview.rows[0]).toMatchObject({
      matchStatus: "matched",
      locationCode: 1024000,
      stateCode: "MN",
    });
  });

  /**
   * The grouping key the service builds from a stored name and the lookup key
   * the matcher asks for are derived in two different places; if they ever stop
   * agreeing, every punctuated city silently becomes "unmatched". "St. Louis"
   * is the case that exercises it — stored with a period the host cannot carry.
   */
  it("keeps its by-name grouping in step with the matcher's lookup keys", async () => {
    mocks.searchCitiesByNames.mockResolvedValue([ST_LOUIS]);
    const service = await loadService();

    const preview = await service.previewImport({
      ...PROJECT,
      text: "st-louis.example.com",
    });

    expect(preview.rows[0]).toMatchObject({
      matchStatus: "matched",
      cityName: "St. Louis",
      locationCode: 1025062,
    });
  });

  it("flags hosts the project already holds instead of re-adding them", async () => {
    mocks.searchCitiesByNames.mockResolvedValue([AUSTIN_TX]);
    mocks.findExistingHosts.mockResolvedValue(new Set(["austin.example.com"]));
    const service = await loadService();

    const preview = await service.previewImport({
      ...PROJECT,
      text: "austin.example.com",
    });

    expect(preview.alreadyImportedCount).toBe(1);
    expect(preview.rows[0]?.alreadyImported).toBe(true);
  });

  it("reports an unseeded location table rather than blaming the hosts", async () => {
    mocks.count.mockResolvedValue(0);
    const service = await loadService();

    const preview = await service.previewImport({
      ...PROJECT,
      text: "austin.example.com",
    });

    expect(preview.geoTableEmpty).toBe(true);
    expect(preview.counts.unmatched).toBe(1);
  });

  it("writes nothing", async () => {
    const service = await loadService();
    await service.previewImport({ ...PROJECT, text: "austin.example.com" });
    expect(mocks.insertMany).not.toHaveBeenCalled();
  });
});

describe("CitySiteService.importChunk", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.searchCitiesByNames.mockResolvedValue([AUSTIN_TX]);
    mocks.insertMany.mockResolvedValue(undefined);
  });

  it("consumes one bounded slice and reports where to resume", async () => {
    const service = await loadService();
    const text = Array.from(
      { length: 120 },
      (_unused, index) => `city${index}.example.com`,
    ).join("\n");

    const first = await service.importChunk({ ...PROJECT, text, offset: 0 });
    expect(first.done).toBe(false);
    expect(first.processed).toBeGreaterThan(0);
    expect(first.processed).toBeLessThan(120);

    const second = await service.importChunk({
      ...PROJECT,
      text,
      offset: first.processed,
    });
    expect(second.processed).toBeGreaterThan(first.processed);
  });

  it("finishes on the chunk that reaches the end of the list", async () => {
    const service = await loadService();
    const result = await service.importChunk({
      ...PROJECT,
      text: "austin.example.com",
      offset: 0,
    });

    expect(result).toMatchObject({ done: true, processed: 1, imported: 1 });
    expect(mocks.insertMany).toHaveBeenCalledWith("p_1", [
      {
        host: "austin.example.com",
        subdomainLabel: "austin",
        cityName: "Austin",
        stateCode: "TX",
        locationCode: 1026201,
        parentMetroCode: 200635,
        matchStatus: "matched",
      },
    ]);
  });

  it("stops cleanly when the offset is past the end", async () => {
    const service = await loadService();
    const result = await service.importChunk({
      ...PROJECT,
      text: "austin.example.com",
      offset: 500,
    });

    expect(result).toMatchObject({ done: true, imported: 0 });
    expect(mocks.insertMany).not.toHaveBeenCalled();
  });
});

describe("CitySiteService.assignLocation", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("re-reads the chosen code rather than trusting the client", async () => {
    mocks.getByCode.mockResolvedValue(AUSTIN_TX);
    const service = await loadService();

    await service.assignLocation({
      projectId: "p_1",
      citySiteId: "cs_1",
      locationCode: 1026201,
    });

    expect(mocks.getByCode).toHaveBeenCalledWith(1026201);
    expect(mocks.setLocation).toHaveBeenCalledWith({
      projectId: "p_1",
      citySiteId: "cs_1",
      cityName: "Austin",
      stateCode: "TX",
      locationCode: 1026201,
      parentMetroCode: 200635,
    });
  });

  it("refuses a code the location table does not carry", async () => {
    mocks.getByCode.mockResolvedValue(null);
    const service = await loadService();

    await expect(
      service.assignLocation({
        projectId: "p_1",
        citySiteId: "cs_1",
        locationCode: 999_999_999,
      }),
    ).rejects.toThrow();
    expect(mocks.setLocation).not.toHaveBeenCalled();
  });
});
