import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TargetArea } from "@/shared/geo/types";

// Defensive, matching this codebase's established convention for testing a
// service whose import graph could otherwise reach a Worker-only `env` read
// (see LocalSeoService.test.ts's own comment) -- harmless here since every
// dependency below is fully mocked, but cheap insurance against a future
// import drifting onto one that isn't.
vi.mock("cloudflare:workers", () => ({ env: {} }));

const mocks = vi.hoisted(() => {
  class GscNotConnectedError extends Error {
    constructor(public readonly projectId: string) {
      super("Search Console is not connected for this project");
      this.name = "GscNotConnectedError";
    }
  }
  return {
    listByProject: vi.fn(),
    setPrimary: vi.fn(),
    clearByProject: vi.fn(),
    geoSearch: vi.fn(),
    geoGetByCode: vi.fn(),
    getCachedBusinessContext: vi.fn(),
    getPerformance: vi.fn(),
    GscNotConnectedError,
  };
});

// Every dependency TargetAreaService touches is mocked wholesale (not
// `importOriginal`) specifically so none of their real file bodies -- which
// reach `@/db`/Cloudflare Workers `env` -- ever execute under plain Node.
vi.mock("@/server/features/geo/repositories/TargetAreaRepository", () => ({
  TargetAreaRepository: {
    listByProject: mocks.listByProject,
    setPrimary: mocks.setPrimary,
    clearByProject: mocks.clearByProject,
  },
}));

vi.mock("@/server/features/geo/repositories/GeoLocationRepository", () => ({
  GeoLocationRepository: {
    search: mocks.geoSearch,
    getByCode: mocks.geoGetByCode,
    count: vi.fn(),
  },
}));

vi.mock("@/server/features/local-seo/services/LocalSeoService", () => ({
  LocalSeoService: {
    getCachedBusinessContext: mocks.getCachedBusinessContext,
  },
}));

vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance: mocks.getPerformance },
  GscNotConnectedError: mocks.GscNotConnectedError,
  isExpectedGrantFailure: () => false,
}));

const billingCustomer = {
  organizationId: "org1",
  userEmail: "a@b.com",
  userId: "u1",
};

// A city row that rolls up into the DFW metro, and the metro row itself --
// the two-hop lookup resolveAreaForPlaceName performs. Codes are placeholder
// except the metro's, which is the real, seeded Dallas-Ft. Worth DMA code
// (200623 -- see the activation plan's "facts discovered from seeded data").
const PLANO_CITY_ROW = {
  code: 900101,
  name: "Plano,Texas,United States",
  type: "City",
  stateCode: "TX",
  countryCode: 2840,
  parentMetroCode: 200623,
};
const DFW_METRO_ROW = {
  code: 200623,
  name: "Dallas-Ft. Worth, TX,Texas,United States",
  type: "DMA Region",
  stateCode: "TX",
  countryCode: 2840,
  parentMetroCode: null,
};
const DFW_AREA: TargetArea = {
  kind: "metro",
  locationCode: 200623,
  label: "Dallas-Ft. Worth, TX",
  parentCountryCode: 2840,
};

function resetAllMocks() {
  mocks.listByProject.mockReset();
  mocks.setPrimary.mockReset();
  mocks.clearByProject.mockReset();
  mocks.geoSearch.mockReset();
  mocks.geoGetByCode.mockReset();
  mocks.getCachedBusinessContext.mockReset();
  mocks.getPerformance.mockReset();
}

/** Common "GBP names Plano, no GSC connection" setup shared by several
 *  tests below -- resolves to the DFW metro via the city's parentMetroCode. */
function mockGbpNamesPlanoNoGsc() {
  mocks.getCachedBusinessContext.mockResolvedValue({
    keyword: "Acme Coffee",
    profile: {
      city: "Plano",
      region: "Texas",
      latitude: null,
      longitude: null,
    },
  });
  mocks.geoSearch.mockResolvedValue([PLANO_CITY_ROW]);
  mocks.geoGetByCode.mockResolvedValue(DFW_METRO_ROW);
  mocks.getPerformance.mockRejectedValue(new mocks.GscNotConnectedError("p1"));
}

describe("TargetAreaService.getTargetArea never auto-confirms", () => {
  beforeEach(resetAllMocks);

  it("returns an unconfirmed proposal, flagged confirmed:false, sourced gbp", async () => {
    mocks.listByProject.mockResolvedValue([]);
    mockGbpNamesPlanoNoGsc();

    const { TargetAreaService } = await import("./TargetAreaService");
    const result = await TargetAreaService.getTargetArea(
      { projectId: "p1" },
      billingCustomer,
    );

    expect(result).toMatchObject({
      confirmed: false,
      proposal: { multi: false, area: DFW_AREA, source: "gbp" },
    });
  });

  it("never calls setPrimary while returning a proposal, however many times it runs", async () => {
    mocks.listByProject.mockResolvedValue([]);
    mockGbpNamesPlanoNoGsc();

    const { TargetAreaService } = await import("./TargetAreaService");
    await TargetAreaService.getTargetArea({ projectId: "p1" }, billingCustomer);
    await TargetAreaService.getTargetArea({ projectId: "p1" }, billingCustomer);
    await TargetAreaService.getTargetArea({ projectId: "p1" }, billingCustomer);

    // THE invariant: reading a proposal, any number of times, must never
    // write confirmedAt. setPrimary is the only function that ever does.
    expect(mocks.setPrimary).not.toHaveBeenCalled();
  });

  it("returns the confirmed primary area directly, without running detection at all", async () => {
    mocks.listByProject.mockResolvedValue([
      {
        id: "row1",
        projectId: "p1",
        kind: "metro",
        locationCode: 200623,
        label: "Dallas-Ft. Worth, TX",
        parentCountryCode: 2840,
        source: "manual",
        isPrimary: true,
        confirmedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const { TargetAreaService } = await import("./TargetAreaService");
    const result = await TargetAreaService.getTargetArea(
      { projectId: "p1" },
      billingCustomer,
    );

    expect(result).toEqual({
      confirmed: true,
      area: DFW_AREA,
      source: "manual",
      confirmedAt: "2026-01-01T00:00:00.000Z",
    });
    // Already confirmed -- detection must not even run, free or not.
    expect(mocks.getCachedBusinessContext).not.toHaveBeenCalled();
    expect(mocks.getPerformance).not.toHaveBeenCalled();
  });

  it("ignores a non-primary or unconfirmed row and still proposes fresh from free signals", async () => {
    mocks.listByProject.mockResolvedValue([
      {
        id: "row1",
        projectId: "p1",
        kind: "city",
        locationCode: 12345,
        label: "Somewhere Else",
        parentCountryCode: 2840,
        source: "manual",
        isPrimary: false,
        confirmedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    mockGbpNamesPlanoNoGsc();

    const { TargetAreaService } = await import("./TargetAreaService");
    const result = await TargetAreaService.getTargetArea(
      { projectId: "p1" },
      billingCustomer,
    );

    expect(result).toMatchObject({ confirmed: false });
    expect(mocks.setPrimary).not.toHaveBeenCalled();
  });

  it("returns null when neither signal resolves anything -- never a fabricated proposal", async () => {
    mocks.listByProject.mockResolvedValue([]);
    mocks.getCachedBusinessContext.mockResolvedValue(null);
    mocks.getPerformance.mockRejectedValue(
      new mocks.GscNotConnectedError("p1"),
    );

    const { TargetAreaService } = await import("./TargetAreaService");
    const result = await TargetAreaService.getTargetArea(
      { projectId: "p1" },
      billingCustomer,
    );

    expect(result).toBeNull();
    expect(mocks.setPrimary).not.toHaveBeenCalled();
  });

  it("returns null, not an invented code, when GBP's city matches no seeded row", async () => {
    mocks.listByProject.mockResolvedValue([]);
    mocks.getCachedBusinessContext.mockResolvedValue({
      keyword: "Acme Coffee",
      profile: {
        city: "Nowheresville",
        region: null,
        latitude: null,
        longitude: null,
      },
    });
    mocks.geoSearch.mockResolvedValue([]); // no seeded match
    mocks.getPerformance.mockRejectedValue(
      new mocks.GscNotConnectedError("p1"),
    );

    const { TargetAreaService } = await import("./TargetAreaService");
    const result = await TargetAreaService.getTargetArea(
      { projectId: "p1" },
      billingCustomer,
    );

    expect(result).toBeNull();
  });
});

describe("TargetAreaService confirm/set are the only writers", () => {
  beforeEach(resetAllMocks);

  it("confirmTargetArea writes the proposal's own area and source", async () => {
    const { TargetAreaService } = await import("./TargetAreaService");
    await TargetAreaService.confirmTargetArea({
      projectId: "p1",
      area: DFW_AREA,
      source: "gbp",
    });

    expect(mocks.setPrimary).toHaveBeenCalledTimes(1);
    expect(mocks.setPrimary).toHaveBeenCalledWith({
      projectId: "p1",
      kind: "metro",
      locationCode: 200623,
      label: "Dallas-Ft. Worth, TX",
      parentCountryCode: 2840,
      source: "gbp",
    });
  });

  it("setTargetArea always writes source manual, regardless of the caller", async () => {
    const { TargetAreaService } = await import("./TargetAreaService");
    await TargetAreaService.setTargetArea({ projectId: "p1", area: DFW_AREA });

    expect(mocks.setPrimary).toHaveBeenCalledWith(
      expect.objectContaining({ source: "manual" }),
    );
  });

  it("clearTargetArea deletes every row for the project", async () => {
    const { TargetAreaService } = await import("./TargetAreaService");
    await TargetAreaService.clearTargetArea({ projectId: "p1" });

    expect(mocks.clearByProject).toHaveBeenCalledWith("p1");
  });
});
