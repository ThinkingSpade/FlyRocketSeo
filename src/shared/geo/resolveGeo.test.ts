import { describe, expect, it } from "vitest";
import { resolveGeo } from "./resolveGeo";
import type { TargetArea } from "./types";

const US = { locationCode: 2840, languageCode: "en" };

const DFW: TargetArea = {
  kind: "metro",
  locationCode: 1026339,
  label: "Dallas-Fort Worth TX",
  parentCountryCode: 2840,
};

describe("resolveGeo without a target area", () => {
  it("keeps keyword volume national", () => {
    const geo = resolveGeo("keyword-volume", null, US);
    expect(geo.locationCode).toBe(2840);
    expect(geo.scope).toBe("national");
  });

  it("keeps the SERP national", () => {
    const geo = resolveGeo("serp", null, US);
    expect(geo).toMatchObject({
      locationCode: 2840,
      provider: "serp",
      scope: "national",
    });
  });
});

describe("resolveGeo with a metro target area", () => {
  it("takes keyword volume local, via Google Ads", () => {
    expect(resolveGeo("keyword-volume", DFW, US)).toMatchObject({
      locationCode: 1026339,
      provider: "google_ads",
      scope: "local",
      label: "Dallas-Fort Worth TX",
    });
  });

  it("keeps difficulty national, because Labs is country-only", () => {
    expect(resolveGeo("keyword-difficulty", DFW, US)).toMatchObject({
      locationCode: 2840,
      provider: "labs",
      scope: "national",
    });
  });

  it("keeps intent national for the same reason", () => {
    expect(resolveGeo("search-intent", DFW, US).scope).toBe("national");
  });

  it("takes the SERP local", () => {
    expect(resolveGeo("serp", DFW, US)).toMatchObject({
      locationCode: 1026339,
      provider: "serp",
      scope: "local",
    });
  });

  it("takes rank tracking local", () => {
    expect(resolveGeo("rank-tracking", DFW, US).locationCode).toBe(1026339);
  });

  it("keeps domain analytics national", () => {
    expect(resolveGeo("domain-analytics", DFW, US)).toMatchObject({
      locationCode: 2840,
      provider: "labs",
      scope: "national",
    });
  });

  it("routes the local pack to the business provider", () => {
    expect(resolveGeo("local-pack", DFW, US).provider).toBe("business");
  });

  it("resolves the parent country, not the session country, for national needs", () => {
    const ukMetro: TargetArea = {
      kind: "metro",
      locationCode: 9041110,
      label: "Greater London",
      parentCountryCode: 2826,
    };
    expect(resolveGeo("keyword-difficulty", ukMetro, US).locationCode).toBe(
      2826,
    );
  });
});

describe("resolveGeo with a country target area", () => {
  it("treats an explicit country area as national, not local", () => {
    const area: TargetArea = {
      kind: "country",
      locationCode: 2840,
      label: "United States",
      parentCountryCode: 2840,
    };
    expect(resolveGeo("keyword-volume", area, US).scope).toBe("national");
  });
});
