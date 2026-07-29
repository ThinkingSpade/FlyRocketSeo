import { describe, expect, it } from "vitest";
import { resolveDomainAnalyticsLocation } from "./serpOverviewGeo";

describe("resolveDomainAnalyticsLocation", () => {
  it("prefers the explicit country pair for a metro run, never the metro code", () => {
    // DFW DMA sent as the run's plain locationCode, US resolved client-side
    // as the country-only pair for Labs (Defect 2 fix).
    expect(
      resolveDomainAnalyticsLocation({
        locationCode: 1_026_339,
        languageCode: "en",
        domainAnalyticsLocationCode: 2840,
        domainAnalyticsLanguageCode: "en",
      }),
    ).toEqual({ locationCode: 2840, languageCode: "en" });
  });

  it("falls back to the plain locationCode/languageCode with no confirmed area, unchanged from before this fix", () => {
    expect(
      resolveDomainAnalyticsLocation({
        locationCode: 2840,
        languageCode: "en",
      }),
    ).toEqual({ locationCode: 2840, languageCode: "en" });
  });

  it("falls back per-field when only one of the pair is sent", () => {
    // Defensive: a caller should never send one without the other, but the
    // fallback is per-field so a partial payload can't silently pair a new
    // country code with a stale language.
    expect(
      resolveDomainAnalyticsLocation({
        locationCode: 2840,
        languageCode: "en",
        domainAnalyticsLocationCode: 2124, // Canada
      }),
    ).toEqual({ locationCode: 2124, languageCode: "en" });
  });
});
