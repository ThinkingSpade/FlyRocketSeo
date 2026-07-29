import { describe, expect, it } from "vitest";
import type { TargetArea } from "@/shared/geo/types";
import { UNRECOGNISED_GEO_CODE_LABEL } from "./rankTrackingConfigArea";
import { resolveRankTrackingLocationLabel } from "./rankTrackingLocationLabel";

const DFW_AREA: TargetArea = {
  kind: "metro",
  locationCode: 200623,
  label: "Dallas-Ft. Worth, TX",
  parentCountryCode: 2840,
};

function placeholderFor(locationCode: number): TargetArea {
  return {
    kind: "city",
    locationCode,
    label: `Location #${locationCode}`,
    parentCountryCode: locationCode,
  };
}

describe("resolveRankTrackingLocationLabel", () => {
  it("shows the same short country label the header showed before this branch", () => {
    // Every config saved before a7ac8b3 -- and any saved since through a
    // plain country pick, still the common case -- is exactly this: a real
    // LOCATION_OPTIONS code, unaffected by anything this fix changes.
    expect(resolveRankTrackingLocationLabel(2840, placeholderFor(2840))).toBe(
      "US",
    );
  });

  it("shows the resolved metro's real name once useConfigAreaLookup has resolved it", () => {
    expect(resolveRankTrackingLocationLabel(200623, DFW_AREA)).toBe(
      "Dallas-Ft. Worth, TX",
    );
  });

  it("shows the honest bare-code placeholder before the async by-code lookup resolves", () => {
    expect(
      resolveRankTrackingLocationLabel(200623, placeholderFor(200623)),
    ).toBe("Location #200623");
  });

  it("says the location is unrecognised once the lookup confirms no row exists -- never 'US', never a guess", () => {
    const unrecognised: TargetArea = {
      kind: "city",
      locationCode: 9999999,
      label: UNRECOGNISED_GEO_CODE_LABEL,
      parentCountryCode: 9999999,
    };
    expect(resolveRankTrackingLocationLabel(9999999, unrecognised)).toBe(
      UNRECOGNISED_GEO_CODE_LABEL,
    );
  });

  it("ignores a resolvedArea left over from a previously viewed different config", () => {
    // resolvedArea is still Dallas (a DIFFERENT config's resolution); the
    // header hasn't re-resolved this new metro code yet. Must fall back to
    // the fresh placeholder for THIS code, never bleed the old name across.
    expect(resolveRankTrackingLocationLabel(300621, DFW_AREA)).toBe(
      "Location #300621",
    );
  });

  it("prefers the short country label over a stale resolvedArea when switching from a metro config to a country one", () => {
    expect(resolveRankTrackingLocationLabel(2840, DFW_AREA)).toBe("US");
  });
});
