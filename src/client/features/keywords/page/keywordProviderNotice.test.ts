import { describe, expect, it } from "vitest";
import { resolveKeywordProviderNotice } from "./keywordProviderNotice";

describe("resolveKeywordProviderNotice", () => {
  it("is labs for a Labs-covered country with no metro scope in play", () => {
    expect(
      resolveKeywordProviderNotice({
        locationCode: 2840,
        scope: "national",
        label: "United States",
      }),
    ).toEqual({ kind: "labs" });
  });

  it("is google-ads-local when a confirmed metro scope is what routes this run to Google Ads", () => {
    // The exact Gap 2 scenario: a US project (Labs-covered) with a
    // confirmed Dallas-Ft. Worth metro must still name Google Ads here,
    // because the metro is what actually gets sent -- not the country.
    expect(
      resolveKeywordProviderNotice({
        locationCode: 200623,
        scope: "local",
        label: "Dallas-Ft. Worth, TX",
      }),
    ).toEqual({ kind: "google-ads-local", areaLabel: "Dallas-Ft. Worth, TX" });
  });

  it("is google-ads-national for a country Labs doesn't cover at all, with no metro involved", () => {
    expect(
      resolveKeywordProviderNotice({
        locationCode: 2352, // Iceland -- googleAdsOnly per keyword-locations.ts
        scope: "national",
        label: "Iceland",
      }),
    ).toEqual({ kind: "google-ads-national" });
  });
});
