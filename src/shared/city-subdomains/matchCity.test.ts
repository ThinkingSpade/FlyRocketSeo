import { describe, expect, it } from "vitest";
import {
  bareCityName,
  cityNameVariants,
  lookupNamesFor,
  matchCity,
  type CityCandidate,
} from "./matchCity";

function city(
  name: string,
  code: number,
  stateCode: string | null,
  parentMetroCode: number | null = null,
): CityCandidate {
  return { code, name, stateCode, parentMetroCode };
}

const AUSTIN_TX = city("Austin,Texas,United States", 1026201, "TX", 200635);
const AUSTIN_MN = city("Austin,Minnesota,United States", 1024000, "MN");
const SAN_ANTONIO = city("San Antonio,Texas,United States", 1026481, "TX");
const ST_LOUIS = city("St. Louis,Missouri,United States", 1025062, "MO");
const DALLAS_TX = city("Dallas,Texas,United States", 1026339, "TX");
const DALLAS_GA = city("Dallas,Georgia,United States", 1013542, "GA");

function parsed(cityQuery: string, fallback?: string, hint?: string) {
  return {
    cityQuery,
    fallbackCityQuery: fallback ?? null,
    stateHint: hint ?? null,
  };
}

describe("matchCity", () => {
  it("matches when exactly one city carries the name", () => {
    expect(
      matchCity(parsed("san antonio", "san", "antonio"), [SAN_ANTONIO]),
    ).toEqual({
      status: "matched",
      cityName: "San Antonio",
      stateCode: "TX",
      locationCode: 1026481,
      parentMetroCode: null,
    });
  });

  it("carries the matched city's metro through", () => {
    const match = matchCity(parsed("austin"), [AUSTIN_TX]);
    expect(match).toMatchObject({ parentMetroCode: 200635 });
  });

  it("returns unmatched when no candidate carries the name", () => {
    expect(matchCity(parsed("nowhereville"), [AUSTIN_TX])).toEqual({
      status: "unmatched",
    });
  });

  it("refuses to tie-break same-named cities in different states", () => {
    const match = matchCity(parsed("dallas"), [DALLAS_TX, DALLAS_GA]);
    expect(match).toEqual({
      status: "ambiguous",
      candidates: [DALLAS_TX, DALLAS_GA],
    });
  });

  describe("full-label reading wins over the state-hint reading", () => {
    it("does not read 'san-antonio' as the city San in state Antonio", () => {
      // Both a real San Antonio and a decoy city called "San" are candidates;
      // the full label must win, or the decoy would be selected.
      const sanDecoy = city("San,Nevada,United States", 999999, "NV");
      const match = matchCity(parsed("san antonio", "san", "antonio"), [
        SAN_ANTONIO,
        sanDecoy,
      ]);
      expect(match).toMatchObject({ locationCode: 1026481 });
    });

    it("falls back to city + state only when the full label matched nothing", () => {
      const match = matchCity(parsed("austin tx", "austin", "tx"), [
        AUSTIN_TX,
        AUSTIN_MN,
      ]);
      expect(match).toMatchObject({ locationCode: 1026201, stateCode: "TX" });
    });
  });

  describe("state hints", () => {
    it("disambiguates by two-letter state code", () => {
      const match = matchCity(parsed("austin mn", "austin", "mn"), [
        AUSTIN_TX,
        AUSTIN_MN,
      ]);
      expect(match).toMatchObject({ locationCode: 1024000 });
    });

    it("disambiguates by full state name from the stored hierarchy", () => {
      const match = matchCity(
        parsed("austin minnesota", "austin", "minnesota"),
        [AUSTIN_TX, AUSTIN_MN],
      );
      expect(match).toMatchObject({ locationCode: 1024000 });
    });

    it("stays ambiguous when the hint matches nothing and several tie", () => {
      const match = matchCity(parsed("dallas zz", "dallas", "zz"), [
        DALLAS_TX,
        DALLAS_GA,
      ]);
      expect(match).toEqual({
        status: "ambiguous",
        candidates: [DALLAS_TX, DALLAS_GA],
      });
    });

    it("does not override a state hint that contradicts the only candidate", () => {
      // "austin-ca" must not resolve to Austin, Texas just because Texas holds
      // the only Austin in the table.
      const match = matchCity(parsed("austin ca", "austin", "ca"), [AUSTIN_TX]);
      expect(match).toEqual({ status: "unmatched" });
    });
  });

  describe("punctuation the subdomain cannot carry", () => {
    it("matches 'st-louis' to the stored 'St. Louis'", () => {
      const match = matchCity(parsed("st louis", "st", "louis"), [ST_LOUIS]);
      expect(match).toMatchObject({
        cityName: "St. Louis",
        locationCode: 1025062,
      });
    });

    it("matches 'winston-salem' to the stored 'Winston-Salem'", () => {
      const winstonSalem = city(
        "Winston-Salem,North Carolina,United States",
        1022451,
        "NC",
      );
      const match = matchCity(parsed("winston salem", "winston", "salem"), [
        winstonSalem,
      ]);
      expect(match).toMatchObject({
        cityName: "Winston-Salem",
        locationCode: 1022451,
      });
    });
  });
});

describe("cityNameVariants", () => {
  it("adds a period form for the abbreviations US city names use", () => {
    expect(cityNameVariants("st louis")).toEqual([
      "st louis",
      "st-louis",
      "st. louis",
    ]);
    expect(cityNameVariants("mt pleasant")).toEqual([
      "mt pleasant",
      "mt-pleasant",
      "mt. pleasant",
    ]);
  });

  it("adds a hyphenated form for genuinely hyphenated city names", () => {
    expect(cityNameVariants("winston salem")).toEqual([
      "winston salem",
      "winston-salem",
    ]);
  });

  it("leaves ordinary names with a single spelling", () => {
    expect(cityNameVariants("austin")).toEqual(["austin"]);
  });

  it("does not add a period to a bare abbreviation with nothing after it", () => {
    expect(cityNameVariants("st")).toEqual(["st"]);
  });

  it("returns nothing for an empty query", () => {
    expect(cityNameVariants("  ")).toEqual([]);
  });
});

describe("bareCityName", () => {
  it("takes the city out of a stored hierarchy", () => {
    expect(bareCityName("Austin,Texas,United States")).toBe("Austin");
  });
});

describe("lookupNamesFor", () => {
  it("collects both readings of every host, deduplicated", () => {
    const names = lookupNamesFor([
      { cityQuery: "austin tx", fallbackCityQuery: "austin" },
      { cityQuery: "austin", fallbackCityQuery: null },
      { cityQuery: "st louis", fallbackCityQuery: "st" },
    ]);
    expect(names).toEqual([
      "austin tx",
      "austin-tx",
      "austin",
      "st louis",
      "st-louis",
      "st. louis",
      "st",
    ]);
  });
});
