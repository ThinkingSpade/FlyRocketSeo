import { describe, expect, it } from "vitest";
import type { TargetArea } from "@/shared/geo/types";
import {
  buildSerpGeoPayload,
  captureSerpRunGeo,
  describeGeoRunErrorForSerp,
  formatSerpGeoLabel,
  parseRestoredSerpRunGeo,
} from "./serpRunGeo";

const US = 2840;

const DFW: TargetArea = {
  kind: "metro",
  locationCode: 1_026_339,
  label: "Dallas-Fort Worth TX",
  parentCountryCode: 2840,
};

// What ScopeControl shows before any target area has ever been confirmed
// (resolveScopeArea.ts's own resolveDefaultScopeArea) -- the "no confirmed
// area" case this task's own constraints require to behave unchanged.
const NO_CONFIRMED_AREA: TargetArea = {
  kind: "country",
  locationCode: US,
  label: "United States",
  parentCountryCode: US,
};

describe("captureSerpRunGeo", () => {
  it("resolves domain analytics to the country, never the metro code, for a local run", () => {
    const geo = captureSerpRunGeo(DFW, US);
    expect(geo.serp).toMatchObject({
      locationCode: 1_026_339,
      scope: "local",
    });
    expect(geo.domainAnalytics).toMatchObject({
      locationCode: US,
      provider: "labs",
      scope: "national",
      label: "United States",
    });
  });

  it("behaves exactly as before this branch with no confirmed area", () => {
    const geo = captureSerpRunGeo(NO_CONFIRMED_AREA, US);
    // No metro in play: every need (including the new domainAnalytics one)
    // resolves to the SAME plain country code the pre-fix single-locationCode
    // design already sent for domain traffic in this case.
    expect(geo.serp.locationCode).toBe(US);
    expect(geo.volume.locationCode).toBe(US);
    expect(geo.domainAnalytics.locationCode).toBe(US);
    expect(geo.domainAnalytics.scope).toBe("national");
  });
});

describe("formatSerpGeoLabel", () => {
  it("qualifies a local-scope label as unconfirmed", () => {
    const geo = captureSerpRunGeo(DFW, US);
    expect(formatSerpGeoLabel("Est. clicks", geo.serp)).toBe(
      "Est. clicks · Dallas-Fort Worth TX (unconfirmed)",
    );
  });

  it("leaves a national-scope label unchanged, matching formatGeoMetricLabel", () => {
    const geo = captureSerpRunGeo(DFW, US);
    expect(formatSerpGeoLabel("Domain traffic", geo.domainAnalytics)).toBe(
      "Domain traffic · US",
    );
  });
});

describe("parseRestoredSerpRunGeo", () => {
  it("round-trips a freshly captured bundle, including domain analytics", () => {
    const geo = captureSerpRunGeo(DFW, US);
    const payload = buildSerpGeoPayload(geo);
    const restored = parseRestoredSerpRunGeo({ geo: payload });
    expect(restored?.serp.locationCode).toBe(1_026_339);
    expect(restored?.domainAnalytics).toMatchObject({
      locationCode: US,
      scope: "national",
    });
  });

  it("backfills domain analytics for a bundle recorded before Defect 2's fix, without losing the rest of the restore", () => {
    const geo = captureSerpRunGeo(DFW, US);
    const payload = buildSerpGeoPayload(geo);
    // Simulate a pre-Defect-2 stored bundle: no domainAnalytics key at all.
    const legacyPayload = {
      v: payload.v,
      serp: payload.serp,
      volume: payload.volume,
      difficulty: payload.difficulty,
    };

    const restored = parseRestoredSerpRunGeo({ geo: legacyPayload });

    expect(restored).not.toBeNull();
    expect(restored?.serp.locationCode).toBe(1_026_339);
    expect(restored?.domainAnalytics).toMatchObject({
      locationCode: US,
      scope: "national",
      label: "United States",
    });
  });

  it("returns null for a run with no stored geo at all", () => {
    expect(parseRestoredSerpRunGeo({ keyword: "x" })).toBeNull();
    expect(parseRestoredSerpRunGeo(null)).toBeNull();
  });
});

describe("describeGeoRunErrorForSerp", () => {
  it("falls back to the plain message with no geo captured yet", () => {
    expect(describeGeoRunErrorForSerp(null, "Something went wrong.")).toBe(
      "Something went wrong.",
    );
  });

  it("names the local area for a local-scope run", () => {
    const geo = captureSerpRunGeo(DFW, US);
    const message = describeGeoRunErrorForSerp(geo, "Something went wrong.");
    expect(message).toContain("Dallas-Fort Worth TX");
  });
});
