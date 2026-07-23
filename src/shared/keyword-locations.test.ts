import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCATION_CODE,
  LABS_LOCATION_OPTIONS,
  LOCATION_OPTIONS,
  US_STATE_OPTIONS,
  getKeywordDataProvider,
  getLanguageCode,
  isLabsLocationCode,
  isSupportedLanguageCode,
  isSupportedLocationCode,
  loadUsCityOptions,
} from "./keyword-locations";

// Real values verified against the source CSV (see
// .superpowers/sdd/task-8-brief.md) -- do not change them to make a failing
// implementation pass.
const TEXAS = 21176;
const DALLAS_TX = 1026339;
const DISTRICT_OF_COLUMBIA = 21140;

describe("keyword locations", () => {
  it("routes Labs-supported countries to labs", () => {
    expect(getKeywordDataProvider(2840)).toBe("labs"); // US
    expect(getKeywordDataProvider(2826)).toBe("labs"); // UK
  });

  it("routes Google-Ads-only countries to google_ads", () => {
    expect(getKeywordDataProvider(2352)).toBe("google_ads"); // Iceland
    expect(isSupportedLocationCode(2352)).toBe(true);
    expect(isLabsLocationCode(2352)).toBe(false);
    expect(getLanguageCode(2352)).toBe("is");
  });

  it("falls back to labs for unknown codes (Labs rejects them upstream)", () => {
    expect(getKeywordDataProvider(999999)).toBe("labs");
    expect(isSupportedLocationCode(999999)).toBe(false);
  });

  it("excludes every Google-Ads-only country from the Labs picker", () => {
    const adsOnly = LOCATION_OPTIONS.filter((option) => option.googleAdsOnly);
    expect(adsOnly.length).toBeGreaterThan(0);
    const labsCodes = new Set(
      LABS_LOCATION_OPTIONS.map((option) => option.code),
    );
    for (const option of adsOnly) {
      expect(labsCodes.has(option.code)).toBe(false);
    }
    expect(LABS_LOCATION_OPTIONS.length + adsOnly.length).toBe(
      LOCATION_OPTIONS.length,
    );
  });

  it("accepts every supported language code and rejects unknown ones", () => {
    // Every per-country default we send is, by construction, a supported code.
    for (const option of LOCATION_OPTIONS) {
      expect(isSupportedLanguageCode(option.languageCode)).toBe(true);
    }
    expect(isSupportedLanguageCode("en")).toBe(true);
    expect(isSupportedLanguageCode("zh-TW")).toBe(true);
    // Non-default codes from the master picker list are valid too (e.g. Hindi).
    expect(isSupportedLanguageCode("hi")).toBe(true);
    // Malformed/unsupported codes DataForSEO would reject as a charged failure.
    expect(isSupportedLanguageCode("english")).toBe(false);
    expect(isSupportedLanguageCode("en-US")).toBe(false);
    expect(isSupportedLanguageCode("zh-tw")).toBe(false);
  });

  it("keeps the picker sorted alphabetically with unique codes", () => {
    const labels = LOCATION_OPTIONS.map((option) => option.label);
    expect(labels).toEqual(labels.toSorted((a, b) => a.localeCompare(b)));
    const codes = LOCATION_OPTIONS.map((option) => option.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("US states", () => {
  // 51, because the District of Columbia is a targetable location.
  it("includes all 51 state-level locations", () => {
    expect(US_STATE_OPTIONS).toHaveLength(51);
  });

  it("includes the District of Columbia", () => {
    expect(US_STATE_OPTIONS.some((o) => o.code === DISTRICT_OF_COLUMBIA)).toBe(
      true,
    );
  });

  it("parents every state to the United States", () => {
    for (const option of US_STATE_OPTIONS) {
      expect(option.parentCode).toBe(DEFAULT_LOCATION_CODE);
    }
  });

  it("gives every state a unique code", () => {
    const codes = US_STATE_OPTIONS.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("US cities", () => {
  it("loads every city without bundling them eagerly", async () => {
    const cities = await loadUsCityOptions();
    expect(cities).toHaveLength(19654);
  });

  // Cities hang off their state, NOT off the country.
  it("parents Dallas to Texas rather than to the country", async () => {
    const cities = await loadUsCityOptions();
    const dallas = cities.find((c) => c.code === DALLAS_TX);
    expect(dallas?.parentCode).toBe(TEXAS);
  });

  // Six US cities are called Dallas; a bare city name is ambiguous.
  it("disambiguates same-named cities in the label", async () => {
    const cities = await loadUsCityOptions();
    const dallases = cities.filter((c) => c.label.startsWith("Dallas"));
    expect(dallases.length).toBeGreaterThan(1);
    expect(new Set(dallases.map((c) => c.label)).size).toBe(dallases.length);
  });
});

describe("getLanguageCode", () => {
  // Every sublocation in this task is American; the existing ?? "en"
  // fallback already covers codes it doesn't have an entry for, so no chain
  // walk was added here -- verified directly against a real US city code.
  it("resolves a US city through the existing fallback", () => {
    expect(getLanguageCode(DALLAS_TX)).toBe("en");
  });
});
