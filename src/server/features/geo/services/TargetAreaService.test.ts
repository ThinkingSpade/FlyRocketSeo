import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TargetArea } from "@/shared/geo/types";
import { TargetAreaService } from "./TargetAreaService";

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

// Two real, distinctly-stated Springfields (same codes geoLocationOptions.
// test.ts already pins as real production data) -- an ambiguous-city-name
// fixture pair, neither rolling up into a metro, so a resolved area is
// "city" kind directly rather than needing a second geoGetByCode hop.
const SPRINGFIELD_IL_ROW = {
  code: 1_017_962,
  name: "Springfield,Illinois,United States",
  type: "City",
  stateCode: "IL",
  countryCode: 2840,
  parentMetroCode: null,
};
const SPRINGFIELD_MO_ROW = {
  code: 1_017_961,
  name: "Springfield,Missouri,United States",
  type: "City",
  stateCode: "MO",
  countryCode: 2840,
  parentMetroCode: null,
};
const SPRINGFIELD_IL_AREA: TargetArea = {
  kind: "city",
  locationCode: 1_017_962,
  // From the row's own `stateCode`, not the name's second segment — see
  // `toCityLabel`. The two agree here; they do not for the city rows whose
  // hierarchy carries a county instead.
  label: "Springfield, IL",
  parentCountryCode: 2840,
};

// A real "Dallas" City row -- distinct from DFW_METRO_ROW above (that one is
// the DMA, "Dallas-Ft. Worth, TX,Texas,United States"; this is the bare city
// itself) -- for proving a bare prefix hit off GeoLocationRepository.search's
// own LIKE query ("Dall" matching "Dallas...") is never accepted as if it
// were an exact name match.
const DALLAS_CITY_ROW = {
  code: 900202,
  name: "Dallas,Texas,United States",
  type: "City",
  stateCode: "TX",
  countryCode: 2840,
  parentMetroCode: 200623,
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

    const result = await TargetAreaService.getTargetArea(
      { projectId: "p1" },
      billingCustomer,
    );

    expect(result).toBeNull();
  });
});

describe("TargetAreaService resolves ambiguous city names honestly", () => {
  beforeEach(resetAllMocks);

  it("an ambiguous city name with no region resolves to null, not the biggest city", async () => {
    mocks.listByProject.mockResolvedValue([]);
    // No GBP profile at all -- the ONLY source of a "Springfield" candidate
    // here is Search Console local-landing-page evidence, which (per
    // collectGscSignal's own explicit `null` region argument) never carries
    // state text -- exactly the caller this ambiguity scenario is about.
    mocks.getCachedBusinessContext.mockResolvedValue(null);
    mocks.getPerformance.mockResolvedValue({
      rows: [
        {
          keys: [
            "coffee shop",
            "https://example.com/service-areas/springfield",
          ],
          clicks: 10,
          impressions: 100,
          position: 5,
        },
      ],
    });
    // Both real Springfields match the "springfield" name exactly -- ambiguous
    // with nothing to break the tie.
    mocks.geoSearch.mockResolvedValue([SPRINGFIELD_IL_ROW, SPRINGFIELD_MO_ROW]);

    const result = await TargetAreaService.getTargetArea(
      { projectId: "p1" },
      billingCustomer,
    );

    expect(result).toBeNull();
    expect(mocks.geoGetByCode).not.toHaveBeenCalled();
    expect(mocks.setPrimary).not.toHaveBeenCalled();
  });

  it("the same ambiguous name WITH a region resolves to that state's own row", async () => {
    mocks.listByProject.mockResolvedValue([]);
    mocks.getCachedBusinessContext.mockResolvedValue({
      keyword: "Acme Coffee",
      profile: {
        city: "Springfield",
        region: "Illinois",
        latitude: null,
        longitude: null,
      },
    });
    mocks.geoSearch.mockResolvedValue([SPRINGFIELD_IL_ROW, SPRINGFIELD_MO_ROW]);
    mocks.getPerformance.mockRejectedValue(
      new mocks.GscNotConnectedError("p1"),
    );

    const result = await TargetAreaService.getTargetArea(
      { projectId: "p1" },
      billingCustomer,
    );

    expect(result).toMatchObject({
      confirmed: false,
      proposal: { multi: false, area: SPRINGFIELD_IL_AREA, source: "gbp" },
    });
    // Neither Springfield rolls up into a metro (parentMetroCode: null) --
    // the region filter alone must have picked the Illinois row.
    expect(mocks.geoGetByCode).not.toHaveBeenCalled();
  });

  it("a bare prefix hit off the LIKE search is never accepted as an exact match", async () => {
    mocks.listByProject.mockResolvedValue([]);
    mocks.getCachedBusinessContext.mockResolvedValue({
      keyword: "Acme Coffee",
      profile: {
        // "Dall" is a real prefix of "Dallas" -- GeoLocationRepository.
        // search's own LIKE query would return the row below for this, same
        // as it must for the picker's own "dal" -> Dallas-before-Dalton
        // behaviour. Proves that behaviour is never reused as "this IS
        // Dallas" for detection.
        city: "Dall",
        region: null,
        latitude: null,
        longitude: null,
      },
    });
    mocks.geoSearch.mockResolvedValue([DALLAS_CITY_ROW]);
    mocks.getPerformance.mockRejectedValue(
      new mocks.GscNotConnectedError("p1"),
    );

    const result = await TargetAreaService.getTargetArea(
      { projectId: "p1" },
      billingCustomer,
    );

    expect(result).toBeNull();
    // The metro hop (DALLAS_CITY_ROW.parentMetroCode -> DFW) must never even
    // be attempted off a row that was never accepted as a match.
    expect(mocks.geoGetByCode).not.toHaveBeenCalled();
  });
});

describe("TargetAreaService confirm/set are the only writers", () => {
  beforeEach(resetAllMocks);

  it("confirmTargetArea writes the proposal's own area and source", async () => {
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
    await TargetAreaService.setTargetArea({ projectId: "p1", area: DFW_AREA });

    expect(mocks.setPrimary).toHaveBeenCalledWith(
      expect.objectContaining({ source: "manual" }),
    );
  });

  it("clearTargetArea deletes every row for the project", async () => {
    await TargetAreaService.clearTargetArea({ projectId: "p1" });

    expect(mocks.clearByProject).toHaveBeenCalledWith("p1");
  });
});
