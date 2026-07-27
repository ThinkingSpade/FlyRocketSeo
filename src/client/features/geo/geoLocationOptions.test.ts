import { describe, expect, it } from "vitest";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";
import type { TargetArea } from "@/shared/geo/types";
import { US_STATES } from "./usStates";
import { US_DMAS } from "./usDmas";
import {
  areaKey,
  buildCityAreas,
  describeNoGeoMatches,
  filterCountryAreas,
  filterMetroAreas,
  filterStateAreas,
  flattenGeoGroups,
  formatCityLabel,
  groupGeoAreas,
  isSameArea,
  selectCityAreas,
  type GeoSearchResult,
} from "./geoLocationOptions";

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

describe("formatCityLabel", () => {
  it("disambiguates same-named US cities by state", () => {
    expect(formatCityLabel("Springfield", "IL", 2840)).toBe("Springfield, IL");
    expect(formatCityLabel("Springfield", "MO", 2840)).toBe("Springfield, MO");
  });

  it("falls back to the country's short label when there is no state", () => {
    expect(formatCityLabel("Paris", null, 2250)).toBe("Paris, FR");
  });

  it("falls back to the bare name when neither is available, rather than inventing a label", () => {
    expect(formatCityLabel("Nowhereville", null, 999_999)).toBe("Nowhereville");
  });
});

describe("buildCityAreas", () => {
  const results: GeoSearchResult[] = [
    {
      code: 1_017_962,
      name: "Springfield",
      type: "City",
      stateCode: "IL",
      countryCode: 2840,
    },
    {
      code: 1_017_961,
      name: "Springfield",
      type: "City",
      stateCode: "MO",
      countryCode: 2840,
    },
    // geo_locations holds every Google geotarget type, not just cities — a
    // seeded deployment could return a State/Country row for a query that
    // also happens to prefix-match a place name. These must be dropped, or
    // the picker would double up with US_STATES/LOCATION_OPTIONS.
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
      name: "Paris",
      type: "City",
      stateCode: null,
      countryCode: 2250,
    },
  ];

  it("keeps only City-typed rows", () => {
    const areas = buildCityAreas(results);
    expect(areas).toHaveLength(3);
    expect(areas.every((area) => area.kind === "city")).toBe(true);
  });

  it("disambiguates and carries the row's own country as parentCountryCode", () => {
    const areas = buildCityAreas(results);
    expect(areas).toEqual([
      {
        kind: "city",
        locationCode: 1_017_962,
        label: "Springfield, IL",
        parentCountryCode: 2840,
      },
      {
        kind: "city",
        locationCode: 1_017_961,
        label: "Springfield, MO",
        parentCountryCode: 2840,
      },
      {
        kind: "city",
        locationCode: 1_006_932,
        label: "Paris, FR",
        parentCountryCode: 2250,
      },
    ]);
  });

  it("returns nothing for an empty result set", () => {
    expect(buildCityAreas([])).toEqual([]);
  });
});

describe("selectCityAreas", () => {
  const springfield: GeoSearchResult = {
    code: 1_017_962,
    name: "Springfield",
    type: "City",
    stateCode: "IL",
    countryCode: 2840,
  };

  it("returns nothing for an empty debounced query, regardless of what the query cache holds", () => {
    // Reproduces the exact scenario this function exists to prevent: real
    // rows sitting in the cache (e.g. a resolved fetch for "spring") plus a
    // debounced query that has since gone back to empty (box cleared). See
    // this function's own doc comment for why the raw query result can't be
    // trusted here -- `keepPreviousData` reports it regardless of `enabled`.
    expect(selectCityAreas("", [springfield])).toEqual([]);
  });

  it("returns nothing for a debounced query that is only whitespace", () => {
    expect(selectCityAreas("   ", [springfield])).toEqual([]);
  });

  it("passes rows through unchanged for a non-empty debounced query", () => {
    expect(selectCityAreas("spring", [springfield])).toEqual(
      buildCityAreas([springfield]),
    );
  });

  it("returns nothing when the debounced query is non-empty but no rows have resolved yet", () => {
    expect(selectCityAreas("spring", [])).toEqual([]);
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
