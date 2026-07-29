import { describe, expect, it } from "vitest";
import type { TargetArea } from "@/shared/geo/types";
import { UNRECOGNISED_GEO_CODE_LABEL } from "./rankTrackingConfigArea";
import {
  locationCodesNeedingLookup,
  resolveRankTrackingLocationLabel,
  resolveRankTrackingLocationLabels,
} from "./rankTrackingLocationLabel";

const DFW_ROW = {
  code: 200623,
  name: "Dallas-Ft. Worth, TX,Texas,United States",
  type: "DMA Region",
  stateCode: null,
  countryCode: 2840,
  parentMetroCode: null,
};

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

// These cover the pure label RESOLUTION only. The wiring that carries a
// locationCode into them -- useRankTrackingLocationLabel's state/effect, and
// RankTrackingDomainList's batched query -- needs a React render, which this
// repo's node-environment, .test.ts-only Vitest cannot do, so it is NOT
// pinned here. Reverting a caller to `LOCATIONS[code] ?? "US"` would leave
// this file green.
describe("resolveRankTrackingLocationLabel", () => {
  it("shows the same short country label every surface showed before this branch", () => {
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

  it("keeps each country's own short label, not just the US default", () => {
    expect(resolveRankTrackingLocationLabel(2826, placeholderFor(2826))).toBe(
      "UK",
    );
    expect(resolveRankTrackingLocationLabel(2124, placeholderFor(2124))).toBe(
      "CA",
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

describe("locationCodesNeedingLookup", () => {
  it("asks about nothing for an all-country list", () => {
    expect(locationCodesNeedingLookup([2840, 2826, 2840, 2124])).toEqual([]);
  });

  it("collapses repeats so twelve trackers in one metro cost one code", () => {
    expect(locationCodesNeedingLookup([200623, 2840, 200623, 200623])).toEqual([
      200623,
    ]);
  });

  it("keeps distinct local codes", () => {
    expect(locationCodesNeedingLookup([200623, 1026339, 2840])).toEqual([
      200623, 1026339,
    ]);
  });

  it("sorts, so the same set of configs in a different order reuses one cache entry", () => {
    // This result is a React Query key. Same set arriving in a different
    // order must not hash to a different key and refetch a cached read.
    expect(locationCodesNeedingLookup([1026339, 200623])).toEqual(
      locationCodesNeedingLookup([200623, 1026339]),
    );
  });
});

describe("resolveRankTrackingLocationLabels", () => {
  it("labels country rows without waiting for the batch query", () => {
    // rows undefined = query still in flight (or never enabled, for an
    // all-country list). Country codes are already final at that point.
    const labels = resolveRankTrackingLocationLabels([2840, 2826], undefined);
    expect(labels.get(2840)).toBe("US");
    expect(labels.get(2826)).toBe("UK");
  });

  it("shows the honest placeholder for a local code while the batch is in flight", () => {
    expect(
      resolveRankTrackingLocationLabels([200623], undefined).get(200623),
    ).toBe("Location #200623");
  });

  it("resolves each local code to its real name once the batch lands", () => {
    const labels = resolveRankTrackingLocationLabels([200623, 2840], [DFW_ROW]);
    expect(labels.get(200623)).toBe("Dallas-Ft. Worth, TX");
    expect(labels.get(2840)).toBe("US");
  });

  it("says unrecognised for a local code the batch came back without -- never 'US', never a guess", () => {
    // The row is simply absent from the response rather than returned as
    // null, which is why this keys by code instead of by position.
    const labels = resolveRankTrackingLocationLabels(
      [200623, 9999999],
      [DFW_ROW],
    );
    expect(labels.get(9999999)).toBe(UNRECOGNISED_GEO_CODE_LABEL);
    expect(labels.get(200623)).toBe("Dallas-Ft. Worth, TX");
  });

  it("treats an empty result set as resolved, so a failed read says unrecognised rather than showing the placeholder forever", () => {
    // RankTrackingDomainList passes [] when nothing needed looking up, and
    // when the read failed with NOTHING previously cached. (A failed refetch
    // that still holds rows keeps passing those rows instead, so this case is
    // specifically the never-succeeded one.)
    const labels = resolveRankTrackingLocationLabels([200623, 2840], []);
    expect(labels.get(200623)).toBe(UNRECOGNISED_GEO_CODE_LABEL);
    expect(labels.get(2840)).toBe("US");
  });

  it("agrees with the single-code resolver on every shared input", () => {
    // The two paths must not drift: whatever the list shows for a code, the
    // detail header must show for the same code. Each single-path TargetArea
    // here is built INDEPENDENTLY of the batch output -- DFW_AREA is the
    // fixture useConfigAreaLookup resolves DFW_ROW to -- so a wrong batch
    // label fails this rather than being fed in as its own expectation.
    const cases: ReadonlyArray<{ code: number; area: TargetArea }> = [
      { code: 2840, area: placeholderFor(2840) },
      { code: 2826, area: placeholderFor(2826) },
      { code: 200623, area: DFW_AREA },
    ];
    for (const { code, area } of cases) {
      expect(
        resolveRankTrackingLocationLabels([code], [DFW_ROW]).get(code),
      ).toBe(resolveRankTrackingLocationLabel(code, area));
    }
  });
});
