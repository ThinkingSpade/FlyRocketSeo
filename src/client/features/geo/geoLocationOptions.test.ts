import { describe, expect, it } from "vitest";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";
import type { TargetArea } from "@/shared/geo/types";
import { US_STATES } from "./usStates";
import { US_DMAS } from "./usDmas";
import {
  areaKey,
  buildCityAreas,
  buildMetroAreasFromSearch,
  describeNoGeoMatches,
  filterCountryAreas,
  filterMetroAreas,
  filterStateAreas,
  flattenGeoGroups,
  groupGeoAreas,
  isSameArea,
  selectCityAreas,
  selectMetroAreasFromSearch,
  type GeoSearchResult,
} from "./geoLocationOptions";

// Shared across buildCityAreas/buildMetroAreasFromSearch below: one row of
// every `geo_locations.type` this app produces, so each function's filter can
// be pinned against the SAME mixed batch a real seeded search could return
// (rather than each function inventing its own single-type fixture) — this is
// exactly what proves buildMetroAreasFromSearch keeps a DMA row while
// dropping City/State/Country ones out of the identical array
// buildCityAreas keeps City from and drops the rest of.
//
// `name` on both the City and DMA Region fixtures below is the REAL stored
// hierarchy shape (verified live against production D1 — see
// geoDisplayName.test.ts's own header), not a bare place name: these are
// exactly what previously proved the labels below were built from an already-
// clean name, when production data never is.
const SPRINGFIELD_IL: GeoSearchResult = {
  code: 1_017_962,
  name: "Springfield,Illinois,United States",
  type: "City",
  stateCode: "IL",
  countryCode: 2840,
};
const DALLAS_FORT_WORTH_DMA: GeoSearchResult = {
  // Real Dallas-Ft. Worth DMA code, verified against seeded production data
  // (see the geo-activation plan's "two facts" note) — 1_026_339 was Plan 1's
  // invented placeholder; do not propagate it further.
  code: 200_623,
  name: "Dallas-Ft. Worth, TX,Texas,United States",
  type: "DMA Region",
  stateCode: "TX",
  countryCode: 2840,
};
const MIXED_TYPE_RESULTS: GeoSearchResult[] = [
  SPRINGFIELD_IL,
  {
    code: 1_017_961,
    name: "Springfield,Missouri,United States",
    type: "City",
    stateCode: "MO",
    countryCode: 2840,
  },
  {
    code: 21_176,
    name: "Texas",
    type: "State",
    stateCode: "TX",
    countryCode: 2840,
  },
  {
    code: 2840,
    name: "United States",
    type: "Country",
    stateCode: null,
    countryCode: 2840,
  },
  {
    code: 1_006_932,
    // Bare, not a hierarchy: only the US is seeded today (geo location
    // seeding is scoped to one country), so a non-US row's real stored shape
    // is unverified — left bare rather than inventing one. toGeoDisplayName
    // passes a comma-less name through unchanged, so this still proves the
    // "don't touch what you haven't verified" behaviour rather than the
    // state-trimming behaviour the US fixtures above prove.
    name: "Paris",
    type: "City",
    stateCode: null,
    countryCode: 2250,
  },
  DALLAS_FORT_WORTH_DMA,
];

describe("filterMetroAreas", () => {
  // US_DMAS ships intentionally empty (see that file's own header) until an
  // operator seeds real DMA codes from the authenticated endpoint — no
  // public source publishes them. Pinning this documents today's real,
  // if provisional, behaviour rather than assuming it.
  it("returns nothing for any query while US_DMAS is empty", () => {
    expect(US_DMAS).toHaveLength(0);
    expect(filterMetroAreas("")).toEqual([]);
    expect(filterMetroAreas("dallas")).toEqual([]);
  });
});

describe("filterStateAreas", () => {
  it("returns every state, unfiltered, for an empty query", () => {
    expect(filterStateAreas("")).toHaveLength(US_STATES.length);
  });

  it("matches a substring of the state name, case-insensitively", () => {
    const result = filterStateAreas("TEX");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "region",
      locationCode: 21176,
      label: "Texas",
      parentCountryCode: 2840,
    });
  });

  it("matches on the two-letter state code even when the name doesn't contain it", () => {
    // "District of Columbia" doesn't contain "dc" as a substring, so this
    // only passes if the stateCode branch of the matcher actually runs.
    expect("district of columbia").not.toContain("dc");
    const result = filterStateAreas("dc");
    expect(result.map((area) => area.label)).toContain("District of Columbia");
  });

  it("returns nothing for a query no state matches", () => {
    expect(filterStateAreas("zzzznonsense")).toEqual([]);
  });
});

describe("filterCountryAreas", () => {
  it("returns every country, unfiltered, for an empty query", () => {
    expect(filterCountryAreas("")).toHaveLength(LOCATION_OPTIONS.length);
  });

  it("matches a substring of the country name, case-insensitively", () => {
    const result = filterCountryAreas("uNiTeD sTaT");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "country",
      locationCode: 2840,
      label: "United States",
      // A country's parent country is itself.
      parentCountryCode: 2840,
    });
  });

  it("matches on the short label even when the name doesn't contain it", () => {
    // "Hong Kong" doesn't contain "hk" as a substring, so this only passes
    // if the shortLabel branch of the matcher actually runs.
    expect("hong kong").not.toContain("hk");
    const result = filterCountryAreas("hk");
    expect(result.map((area) => area.label)).toContain("Hong Kong");
  });
});

describe("buildCityAreas", () => {
  // geo_locations holds every Google geotarget type, not just cities — a
  // seeded deployment could return a State/Country/DMA row for a query that
  // also happens to prefix-match a place name. These must be dropped, or the
  // picker would double up with US_STATES/LOCATION_OPTIONS, or show a metro
  // as a city.
  it("keeps only City-typed rows", () => {
    const areas = buildCityAreas(MIXED_TYPE_RESULTS);
    expect(areas).toHaveLength(3);
    expect(areas.every((area) => area.kind === "city")).toBe(true);
  });

  it("disambiguates same-named cities via the stored name's own state segment", () => {
    const areas = buildCityAreas(MIXED_TYPE_RESULTS);
    expect(areas).toEqual([
      {
        kind: "city",
        locationCode: 1_017_962,
        label: "Springfield, Illinois",
        parentCountryCode: 2840,
      },
      {
        kind: "city",
        locationCode: 1_017_961,
        label: "Springfield, Missouri",
        parentCountryCode: 2840,
      },
      {
        kind: "city",
        // Bare fixture (see MIXED_TYPE_RESULTS's own comment): passed through
        // unchanged since there's no hierarchy to trim, not "Paris, FR".
        locationCode: 1_006_932,
        label: "Paris",
        parentCountryCode: 2250,
      },
    ]);
  });

  it("returns nothing for an empty result set", () => {
    expect(buildCityAreas([])).toEqual([]);
  });
});

describe("buildMetroAreasFromSearch", () => {
  it("turns a seeded DMA Region row into a metro TargetArea, dropping every other type in the same batch", () => {
    // The exact failing input from the review: US_DMAS ships empty (see
    // usDmas.ts's own header), and a seeded "DMA Region" row must still
    // become a selectable metro on its own — the empty bundled table is an
    // accelerator, never a whitelist a real seeded row has to clear. Reusing
    // MIXED_TYPE_RESULTS (rather than a DMA-only fixture) also proves the
    // City/State/Country rows in that same batch are correctly dropped.
    expect(US_DMAS).toHaveLength(0);
    expect(buildMetroAreasFromSearch(MIXED_TYPE_RESULTS)).toEqual([
      {
        kind: "metro",
        locationCode: 200_623,
        // Trimmed from the stored hierarchy "Dallas-Ft. Worth,
        // TX,Texas,United States" -- proves this label is no longer the raw
        // stored name verbatim.
        label: "Dallas-Ft. Worth, TX",
        parentCountryCode: 2840,
      },
    ]);
  });

  it("returns nothing when no row in the batch is DMA-Region-typed", () => {
    expect(buildMetroAreasFromSearch(MIXED_TYPE_RESULTS.slice(0, -1))).toEqual(
      [],
    );
  });

  it("returns nothing for an empty result set", () => {
    expect(buildMetroAreasFromSearch([])).toEqual([]);
  });
});

describe("selectCityAreas", () => {
  it("returns nothing for an empty debounced query, regardless of what the query cache holds", () => {
    // Reproduces the exact scenario this function exists to prevent: real
    // rows sitting in the cache (e.g. a resolved fetch for "spring") plus a
    // debounced query that has since gone back to empty (box cleared). See
    // this function's own doc comment for why the raw query result can't be
    // trusted here -- `keepPreviousData` reports it regardless of `enabled`.
    expect(selectCityAreas("", [SPRINGFIELD_IL])).toEqual([]);
  });

  it("returns nothing for a debounced query that is only whitespace", () => {
    expect(selectCityAreas("   ", [SPRINGFIELD_IL])).toEqual([]);
  });

  it("passes rows through unchanged for a non-empty debounced query", () => {
    expect(selectCityAreas("spring", [SPRINGFIELD_IL])).toEqual(
      buildCityAreas([SPRINGFIELD_IL]),
    );
  });

  it("returns nothing when the debounced query is non-empty but no rows have resolved yet", () => {
    expect(selectCityAreas("spring", [])).toEqual([]);
  });
});

describe("selectMetroAreasFromSearch", () => {
  it("returns nothing for an empty debounced query, regardless of what the query cache holds", () => {
    // Same staleness scenario selectCityAreas guards against, for the metro
    // group: a resolved "dal" fetch sitting in the query cache must not leak
    // through once the box is cleared back to empty.
    expect(selectMetroAreasFromSearch("", [DALLAS_FORT_WORTH_DMA])).toEqual([]);
  });

  it("returns nothing for a debounced query that is only whitespace", () => {
    expect(selectMetroAreasFromSearch("   ", [DALLAS_FORT_WORTH_DMA])).toEqual(
      [],
    );
  });

  it("passes rows through unchanged for a non-empty debounced query", () => {
    expect(selectMetroAreasFromSearch("dal", [DALLAS_FORT_WORTH_DMA])).toEqual(
      buildMetroAreasFromSearch([DALLAS_FORT_WORTH_DMA]),
    );
  });

  it("returns nothing when the debounced query is non-empty but no rows have resolved yet", () => {
    expect(selectMetroAreasFromSearch("dal", [])).toEqual([]);
  });
});

describe("groupGeoAreas", () => {
  const metro: TargetArea = {
    kind: "metro",
    locationCode: 1_026_339,
    label: "Dallas-Fort Worth TX",
    parentCountryCode: 2840,
  };
  const city: TargetArea = {
    kind: "city",
    locationCode: 1_017_962,
    label: "Springfield, IL",
    parentCountryCode: 2840,
  };
  const state: TargetArea = {
    kind: "region",
    locationCode: 21_176,
    label: "Texas",
    parentCountryCode: 2840,
  };
  const country: TargetArea = {
    kind: "country",
    locationCode: 2840,
    label: "United States",
    parentCountryCode: 2840,
  };

  it("orders groups Metros -> Cities -> States -> Countries", () => {
    const groups = groupGeoAreas({
      metros: [metro],
      cities: [city],
      states: [state],
      countries: [country],
    });
    expect(groups.map((group) => group.key)).toEqual([
      "metro",
      "city",
      "region",
      "country",
    ]);
    expect(groups.map((group) => group.heading)).toEqual([
      "Metros",
      "Cities",
      "States",
      "Countries",
    ]);
  });

  it("omits a group entirely when it has no rows, rather than rendering an empty heading", () => {
    const groups = groupGeoAreas({
      metros: [], // e.g. today's empty US_DMAS
      cities: [city],
      states: [],
      countries: [country],
    });
    expect(groups.map((group) => group.key)).toEqual(["city", "country"]);
  });

  it("returns no groups at all when every source is empty", () => {
    expect(
      groupGeoAreas({ metros: [], cities: [], states: [], countries: [] }),
    ).toEqual([]);
  });
});

describe("flattenGeoGroups", () => {
  it("concatenates rows across groups in render order", () => {
    const groups = groupGeoAreas({
      metros: [],
      cities: [
        {
          kind: "city",
          locationCode: 1,
          label: "City A",
          parentCountryCode: 2840,
        },
        {
          kind: "city",
          locationCode: 2,
          label: "City B",
          parentCountryCode: 2840,
        },
      ],
      states: [
        {
          kind: "region",
          locationCode: 3,
          label: "State A",
          parentCountryCode: 2840,
        },
      ],
      countries: [],
    });
    expect(flattenGeoGroups(groups).map((area) => area.label)).toEqual([
      "City A",
      "City B",
      "State A",
    ]);
  });

  it("returns an empty list when there are no groups", () => {
    expect(flattenGeoGroups([])).toEqual([]);
  });
});

describe("describeNoGeoMatches", () => {
  it("names the typed query and points at the seed script", () => {
    const message = describeNoGeoMatches("  dallas  ");
    expect(message).toContain("dallas");
    expect(message).not.toContain("  dallas  ");
    expect(message).toContain("scripts/seed-geo-locations.ts");
  });

  it("never claims a place doesn't exist — only that nothing in the bundled data matched", () => {
    const message = describeNoGeoMatches("zzzznonsense");
    expect(message.toLowerCase()).not.toContain("no such");
    expect(message).toContain("No states or countries match");
  });

  it("names metros specifically, not just cities", () => {
    // Finding 4's second half: an unseeded deployment's empty state must say
    // something true about metros — US_DMAS never populates on its own, so
    // "seed this" is the ONLY path to a metro, not merely the faster one.
    const message = describeNoGeoMatches("dallas");
    expect(message.toLowerCase()).toContain("metro");
  });
});

describe("areaKey", () => {
  it("combines kind and locationCode into a stable identity", () => {
    expect(
      areaKey({
        kind: "city",
        locationCode: 5,
        label: "X",
        parentCountryCode: 2840,
      }),
    ).toBe("city:5");
  });
});

describe("isSameArea", () => {
  const texas: TargetArea = {
    kind: "region",
    locationCode: 21_176,
    label: "Texas",
    parentCountryCode: 2840,
  };

  it("is false when there is no current value", () => {
    expect(isSameArea(null, texas)).toBe(false);
  });

  it("is true for a matching kind and locationCode", () => {
    expect(isSameArea({ ...texas }, texas)).toBe(true);
  });

  it("is false when the kind differs even if the code matches", () => {
    expect(isSameArea({ ...texas, kind: "metro" }, texas)).toBe(false);
  });

  it("is false when the locationCode differs", () => {
    expect(isSameArea({ ...texas, locationCode: 1 }, texas)).toBe(false);
  });
});

// End-to-end pin for the exact scenario this task's own verification walks
// through: querying "tex" against the REAL bundled tables (not fixtures)
// should surface Texas via the synchronous state filter alone, with no
// metro/city/country noise.
describe('querying "tex" against the real bundled tables', () => {
  it("surfaces only the States group, containing Texas", () => {
    const groups = groupGeoAreas({
      metros: filterMetroAreas("tex"),
      cities: buildCityAreas([]), // D1 unseeded in this environment
      states: filterStateAreas("tex"),
      countries: filterCountryAreas("tex"),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "region", heading: "States" });
    expect(groups[0]?.rows.map((area) => area.label)).toEqual(["Texas"]);
  });
});
