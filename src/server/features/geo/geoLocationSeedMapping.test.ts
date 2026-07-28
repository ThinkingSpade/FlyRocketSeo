import { describe, expect, it } from "vitest";
import {
  buildGeoLocationRows,
  buildGoogleAdsLocationsPath,
  buildUsStateCodeMap,
  GEO_SEED_COUNTRY,
  readNumber,
  readString,
  sliceGeoLocationRowsChunk,
  toRawLocationRow,
  type GeoLocationRow,
  type RawLocationRow,
} from "./geoLocationSeedMapping";

// Small synthetic US_STATES-shaped fixture — deliberately not the real
// (51-row) table, so these tests pin the resolution LOGIC rather than
// today's actual state codes drifting the test with them.
const US_STATES_FIXTURE = [
  { code: 21176, name: "Texas", stateCode: "TX" },
  // No `stateCode` on purpose: buildUsStateCodeMap must skip it rather than
  // add a `undefined` map entry.
  { code: 21999, name: "Unmapped Territory" },
];

describe("toRawLocationRow", () => {
  it("returns an empty object for a non-record value", () => {
    expect(toRawLocationRow(null)).toEqual({});
    expect(toRawLocationRow(undefined)).toEqual({});
    expect(toRawLocationRow("a string")).toEqual({});
    expect(toRawLocationRow(42)).toEqual({});
  });

  it("reads every field from a well-formed row", () => {
    expect(
      toRawLocationRow({
        location_code: 2840,
        location_name: "United States",
        location_code_parent: 0,
        country_iso_code: "US",
        location_type: "Country",
      }),
    ).toEqual({
      location_code: 2840,
      location_name: "United States",
      location_code_parent: 0,
      country_iso_code: "US",
      location_type: "Country",
    });
  });

  it("drops a field whose value has the wrong type instead of coercing it", () => {
    expect(
      toRawLocationRow({
        location_code: "2840", // wrong type: string, not number
        location_name: 12345, // wrong type: number, not string
        location_type: "Country",
      }),
    ).toEqual({
      location_code: undefined,
      location_name: undefined,
      location_code_parent: undefined,
      country_iso_code: undefined,
      location_type: "Country",
    });
  });
});

describe("readNumber / readString", () => {
  it("readNumber accepts only numbers", () => {
    expect(readNumber(5)).toBe(5);
    expect(readNumber("5")).toBeUndefined();
    expect(readNumber(null)).toBeUndefined();
  });

  it("readString accepts only strings", () => {
    expect(readString("dal")).toBe("dal");
    expect(readString(5)).toBeUndefined();
    expect(readString(null)).toBeUndefined();
  });
});

describe("buildUsStateCodeMap", () => {
  it("maps each state's code to its abbreviation", () => {
    const map = buildUsStateCodeMap(US_STATES_FIXTURE);
    expect(map.get(21176)).toBe("TX");
  });

  it("skips a state with no stateCode rather than adding an undefined entry", () => {
    const map = buildUsStateCodeMap(US_STATES_FIXTURE);
    expect(map.has(21999)).toBe(false);
  });
});

describe("buildGeoLocationRows", () => {
  const usStateCodes = buildUsStateCodeMap(US_STATES_FIXTURE);

  const usCountry: RawLocationRow = {
    location_code: 2840,
    location_name: "United States",
    country_iso_code: "US",
    location_type: "Country",
  };
  const texas: RawLocationRow = {
    location_code: 21176,
    location_name: "Texas",
    location_code_parent: 2840,
    country_iso_code: "US",
    location_type: "State",
  };
  const dfwDma: RawLocationRow = {
    location_code: 1_026_339,
    location_name: "Dallas-Fort Worth TX",
    location_code_parent: 2840,
    country_iso_code: "US",
    location_type: "DMA Region",
  };
  const dallasCity: RawLocationRow = {
    location_code: 9_999_001,
    location_name: "Dallas",
    location_code_parent: 1_026_339, // parented under the DMA, not the state
    country_iso_code: "US",
    location_type: "City",
  };
  const austinCity: RawLocationRow = {
    location_code: 9_999_002,
    location_name: "Austin",
    location_code_parent: 21176, // parented directly under the state
    country_iso_code: "US",
    location_type: "City",
  };

  it("resolves a Country row's own code as its country code", () => {
    const { rows } = buildGeoLocationRows([usCountry], usStateCodes);
    expect(rows).toEqual([
      {
        code: 2840,
        name: "United States",
        type: "Country",
        countryCode: 2840,
        stateCode: null,
        parentMetroCode: null,
      },
    ]);
  });

  it("resolves country via country_iso_code when the row isn't itself a Country", () => {
    // France, not the UK: LOCATION_OPTIONS.shortLabel for the United Kingdom
    // is "UK", not the real ISO code "GB" DataForSEO would actually send, so
    // that one country only resolves via the ancestor-walk fallback below,
    // never this direct-lookup fast path — a pre-existing quirk of the
    // shared LOCATION_OPTIONS table, not something introduced here.
    const frPlace: RawLocationRow = {
      location_code: 88_888,
      location_name: "Some French Place",
      country_iso_code: "FR",
      location_type: "Region",
    };
    const { rows } = buildGeoLocationRows([frPlace], usStateCodes);
    expect(rows[0]?.countryCode).toBe(2250); // France, per LOCATION_OPTIONS
  });

  it("resolves country by walking up to a Country ancestor when country_iso_code is absent", () => {
    const noIsoCode: RawLocationRow = {
      location_code: 88_889,
      location_name: "Ancestor Resolved Place",
      location_code_parent: 2840,
      location_type: "Region",
      // country_iso_code deliberately omitted
    };
    const { rows } = buildGeoLocationRows([usCountry, noIsoCode], usStateCodes);
    const resolved = rows.find((row) => row.code === 88_889);
    expect(resolved?.countryCode).toBe(2840);
  });

  it("resolves a state code directly when the row IS a mapped state", () => {
    const { rows } = buildGeoLocationRows([texas], usStateCodes);
    expect(rows[0]?.stateCode).toBe("TX");
  });

  it("resolves a state code by walking up to a mapped state ancestor", () => {
    const { rows } = buildGeoLocationRows(
      [usCountry, texas, austinCity],
      usStateCodes,
    );
    const austin = rows.find((row) => row.code === 9_999_002);
    expect(austin?.stateCode).toBe("TX");
  });

  it("leaves state code null when no ancestor is a mapped state", () => {
    const { rows } = buildGeoLocationRows(
      [usCountry, dfwDma, dallasCity],
      usStateCodes,
    );
    const dallas = rows.find((row) => row.code === 9_999_001);
    expect(dallas?.stateCode).toBeNull();
  });

  it("a DMA Region row's own parentMetroCode is null (a metro has no parent metro)", () => {
    const { rows } = buildGeoLocationRows([usCountry, dfwDma], usStateCodes);
    const dfw = rows.find((row) => row.code === 1_026_339);
    expect(dfw?.parentMetroCode).toBeNull();
  });

  it("resolves parentMetroCode by walking up to a DMA Region ancestor", () => {
    const { rows } = buildGeoLocationRows(
      [usCountry, dfwDma, dallasCity],
      usStateCodes,
    );
    const dallas = rows.find((row) => row.code === 9_999_001);
    expect(dallas?.parentMetroCode).toBe(1_026_339);
  });

  it("leaves parentMetroCode null when no ancestor is a DMA Region", () => {
    const { rows } = buildGeoLocationRows(
      [usCountry, texas, austinCity],
      usStateCodes,
    );
    const austin = rows.find((row) => row.code === 9_999_002);
    expect(austin?.parentMetroCode).toBeNull();
  });

  it("skips a row missing code, name, or type and counts it", () => {
    const missingName: RawLocationRow = {
      location_code: 777,
      location_type: "City",
      // location_name deliberately omitted
    };
    const { rows, skipped } = buildGeoLocationRows(
      [usCountry, missingName],
      usStateCodes,
    );
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it("skips a row whose country cannot be resolved and counts it, without inventing a country", () => {
    const unresolvable: RawLocationRow = {
      location_code: 555,
      location_name: "Nowhere",
      location_code_parent: 424_242, // no such ancestor exists
      location_type: "City",
      // no country_iso_code either
    };
    const { rows, skipped } = buildGeoLocationRows(
      [usCountry, unresolvable],
      usStateCodes,
    );
    expect(rows.map((row) => row.code)).toEqual([2840]);
    expect(skipped).toBe(1);
  });

  it("terminates on a cyclic parent chain instead of hanging, and skips both unresolvable rows", () => {
    const cycleA: RawLocationRow = {
      location_code: 111,
      location_name: "Cycle A",
      location_code_parent: 222,
      location_type: "City",
    };
    const cycleB: RawLocationRow = {
      location_code: 222,
      location_name: "Cycle B",
      location_code_parent: 111,
      location_type: "City",
    };
    const { rows, skipped } = buildGeoLocationRows(
      [cycleA, cycleB],
      usStateCodes,
    );
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(2);
  });
});

describe("sliceGeoLocationRowsChunk", () => {
  const rows: GeoLocationRow[] = Array.from({ length: 25 }, (_, index) => ({
    code: index,
    name: `Place ${index}`,
    type: "City",
    stateCode: null,
    parentMetroCode: null,
    countryCode: 2840,
  }));

  it("takes the first chunkSize rows starting at offset 0", () => {
    const result = sliceGeoLocationRowsChunk(rows, 0, 10);
    expect(result.chunk).toHaveLength(10);
    expect(result.chunk[0]?.code).toBe(0);
    expect(result.writtenSoFar).toBe(10);
    expect(result.done).toBe(false);
  });

  it("continues from a non-zero offset", () => {
    const result = sliceGeoLocationRowsChunk(rows, 10, 10);
    expect(result.chunk).toHaveLength(10);
    expect(result.chunk[0]?.code).toBe(10);
    expect(result.writtenSoFar).toBe(20);
    expect(result.done).toBe(false);
  });

  it("reports done as soon as the last row is included, even mid-chunk", () => {
    const result = sliceGeoLocationRowsChunk(rows, 20, 10); // only 5 remain
    expect(result.chunk).toHaveLength(5);
    expect(result.writtenSoFar).toBe(25);
    expect(result.done).toBe(true);
  });

  it("reports done with an empty chunk once offset reaches the end", () => {
    const result = sliceGeoLocationRowsChunk(rows, 25, 10);
    expect(result.chunk).toHaveLength(0);
    expect(result.writtenSoFar).toBe(25);
    expect(result.done).toBe(true);
  });

  it("clamps an offset past the end rather than reporting a bogus writtenSoFar", () => {
    const result = sliceGeoLocationRowsChunk(rows, 999, 10);
    expect(result.chunk).toHaveLength(0);
    expect(result.writtenSoFar).toBe(25);
    expect(result.done).toBe(true);
  });

  it("clamps a negative offset to 0", () => {
    const result = sliceGeoLocationRowsChunk(rows, -5, 10);
    expect(result.chunk[0]?.code).toBe(0);
    expect(result.writtenSoFar).toBe(10);
  });

  it("is exact on a chunk size that divides the total evenly", () => {
    const first = sliceGeoLocationRowsChunk(rows.slice(0, 20), 0, 10);
    expect(first.done).toBe(false);
    const second = sliceGeoLocationRowsChunk(rows.slice(0, 20), 10, 10);
    expect(second.done).toBe(true);
  });
});

// Regression coverage for the country-scoping fix: production failed twice
// fetching DataForSEO's unscoped, ~94,933-row global location list, even
// after that fetch was staged to run only once per run (see
// GeoLocationSeedService.ts's own header for the full history). These tests
// pin the request this app now actually sends, so a future change can't
// silently widen back to the unscoped endpoint without a test noticing.
describe("GEO_SEED_COUNTRY / buildGoogleAdsLocationsPath", () => {
  it("defaults to the US -- this app's actual gap is US DMA/metro rows", () => {
    expect(GEO_SEED_COUNTRY).toBe("us");
  });

  it("builds the documented country-scoped path with a lowercase ISO-2 code", () => {
    expect(buildGoogleAdsLocationsPath("us")).toBe(
      "/v3/keywords_data/google_ads/locations/us",
    );
  });

  it("builds the real default path GEO_SEED_COUNTRY resolves to", () => {
    expect(buildGoogleAdsLocationsPath(GEO_SEED_COUNTRY)).toBe(
      "/v3/keywords_data/google_ads/locations/us",
    );
  });

  it("URL-encodes the country segment rather than interpolating it raw", () => {
    // No real value should ever need escaping (ISO-2 codes are two plain
    // letters), but this pins that a future, wider value can't silently
    // corrupt the path.
    expect(buildGoogleAdsLocationsPath("u s")).toBe(
      "/v3/keywords_data/google_ads/locations/u%20s",
    );
  });
});
