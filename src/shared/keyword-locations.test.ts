import { describe, expect, it } from "vitest";
import {
  LABS_LOCATION_OPTIONS,
  LOCATION_OPTIONS,
  getKeywordDataProvider,
  getLanguageCode,
  isLabsLocationCode,
  isSupportedLanguageCode,
  isSupportedLocationCode,
} from "./keyword-locations";

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

  it("routes unrecognised-but-plausible codes to Google Ads rather than falling through to Labs", () => {
    // This is the inverse of the old contract (unknown -> labs): Labs rejects
    // sub-country codes outright, so an unrecognised code that is LARGE
    // enough to be a real metro/city/region code (every one of which is well
    // above MIN_SUB_COUNTRY_LOCATION_CODE) must go to Google Ads instead.
    // isSupportedLocationCode is unaffected; 999999 is still not a real
    // country — it stands in for "some metro/city code this table doesn't
    // enumerate", the same role it plays in resolveGeo.test.ts's UK metro.
    expect(getKeywordDataProvider(999999)).toBe("google_ads");
    expect(isSupportedLocationCode(999999)).toBe(false);
  });

  it("routes a garbage code too small to be any real geotarget back to Labs", () => {
    // The regression this guards: routing EVERY unrecognised code to Google
    // Ads (not just plausible metro/city ones) let a nonsense location like
    // `locationCode: 1` reach a metered Google Ads call instead of failing
    // free validation the way it did before sub-country routing existed. 1
    // is far below MIN_SUB_COUNTRY_LOCATION_CODE (10,000), so it falls back
    // to "labs" — the same default every unrecognised code used before this
    // routing existed at all — which is what lets schemas.ts's
    // assertLanguageForLocation reject it at zero cost.
    expect(getKeywordDataProvider(1)).toBe("labs");
    expect(isSupportedLocationCode(1)).toBe(false);
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

describe("getKeywordDataProvider", () => {
  it("routes a Labs-supported country to Labs", () => {
    expect(getKeywordDataProvider(2840)).toBe("labs");
  });

  it("routes a Google-Ads-only country to Google Ads", () => {
    // Iceland: outside Labs' 94-country coverage.
    expect(getKeywordDataProvider(2352)).toBe("google_ads");
  });

  it("routes a plausible metro code to Google Ads", () => {
    // Metro/city geotargets are not in LOCATION_CODES at all. Labs is
    // country-only and rejects them, so they must go to Google Ads rather
    // than falling through to a provider that cannot serve them.
    expect(getKeywordDataProvider(1026339)).toBe("google_ads");
  });

  it("rejects a garbage code instead of routing it to a metered Google Ads call", () => {
    // The exact regression this task fixes: MCP keyword research with
    // `locationCode: 1` must NOT resolve to "google_ads" (which would let a
    // nonsense location reach a metered request) — it must fall back to
    // "labs", the same default every unrecognised code used before
    // sub-country routing existed, so schemas.ts's free validation guards
    // (assertLanguageForLocation/assertLabsLocationCode) still catch it.
    expect(getKeywordDataProvider(1)).toBe("labs");
  });

  it("pins the exact MIN_SUB_COUNTRY_LOCATION_CODE boundary", () => {
    // 9999 must not be mistaken for a real sub-country code; 10000 must not
    // be mistaken for garbage. Both are unrecognised (neither is a real
    // country or a real bundled sub-country code), so this isolates the
    // threshold itself rather than any specific known location.
    expect(getKeywordDataProvider(9999)).toBe("labs");
    expect(getKeywordDataProvider(10000)).toBe("google_ads");
  });
});
