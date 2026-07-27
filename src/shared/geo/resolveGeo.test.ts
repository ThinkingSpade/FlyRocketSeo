import { describe, expect, it } from "vitest";
import { resolveGeo } from "./resolveGeo";
import type { TargetArea } from "./types";

const US = { locationCode: 2840, languageCode: "en" };
const UK = { locationCode: 2826, languageCode: "en" };

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

describe("resolveGeo label without a target area", () => {
  // No target area means every one of these needs falls back to describing
  // the whole session country, so the label must be that country's own
  // name — never a different, hardcoded country. Pinned per-need because
  // the fix touches three separate branches (local-pack, the NATIONAL_ONLY
  // branch, and the generic national branch) that must each get it right.
  it("labels keyword volume with the US session's own country name", () => {
    expect(resolveGeo("keyword-volume", null, US).label).toBe("United States");
  });

  it("labels keyword difficulty with the US session's own country name", () => {
    expect(resolveGeo("keyword-difficulty", null, US).label).toBe(
      "United States",
    );
  });

  it("labels the SERP need with the US session's own country name", () => {
    expect(resolveGeo("serp", null, US).label).toBe("United States");
  });

  it("labels the local pack with the US session's own country name", () => {
    expect(resolveGeo("local-pack", null, US).label).toBe("United States");
  });

  it("labels keyword volume with the UK session's own country name, not a hardcoded US default", () => {
    expect(resolveGeo("keyword-volume", null, UK).label).toBe("United Kingdom");
  });

  it("labels keyword difficulty with the UK session's own country name, not a hardcoded US default", () => {
    expect(resolveGeo("keyword-difficulty", null, UK).label).toBe(
      "United Kingdom",
    );
  });

  it("labels the SERP need with the UK session's own country name, not a hardcoded US default", () => {
    expect(resolveGeo("serp", null, UK).label).toBe("United Kingdom");
  });

  it("labels the local pack with the UK session's own country name, not the hardcoded United States", () => {
    // Verified live: a UK session (locationCode 2826) with no target area
    // returned label: "United States" while locationCode was correctly
    // 2826 — the label contradicted the code it shipped alongside.
    expect(resolveGeo("local-pack", null, UK).label).toBe("United Kingdom");
  });

  it("labels every no-area need empty, without throwing, for an unrecognised session country", () => {
    const UNRECOGNISED = { locationCode: 999_999, languageCode: "en" };
    expect(resolveGeo("keyword-volume", null, UNRECOGNISED).label).toBe("");
    expect(resolveGeo("keyword-difficulty", null, UNRECOGNISED).label).toBe("");
    expect(resolveGeo("serp", null, UNRECOGNISED).label).toBe("");
    expect(resolveGeo("local-pack", null, UNRECOGNISED).label).toBe("");
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

  it("still labels the local pack with the metro's own name, not the country's", () => {
    // Guards the fix above the other way: giving the no-area case a real
    // country label must not clobber the has-area case's own label.
    expect(resolveGeo("local-pack", DFW, US).label).toBe(
      "Dallas-Fort Worth TX",
    );
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
