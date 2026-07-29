import { describe, expect, it } from "vitest";
import {
  resolveActiveScopeArea,
  resolveDefaultScopeArea,
  resolveEffectiveScopeArea,
} from "./resolveScopeArea";
import type { TargetArea } from "@/shared/geo/types";

// The real Dallas-Ft. Worth DMA code, verified against seeded production
// data -- matches detectTargetArea.test.ts's own fixture.
const DFW: TargetArea = {
  kind: "metro",
  locationCode: 200623,
  label: "Dallas-Ft. Worth, TX",
  parentCountryCode: 2840,
};

describe("resolveDefaultScopeArea", () => {
  it("builds a country-kind area for the US default location code", () => {
    expect(resolveDefaultScopeArea(2840)).toEqual({
      kind: "country",
      locationCode: 2840,
      label: "United States",
      parentCountryCode: 2840,
    });
  });

  it("builds a country-kind area for a non-US project market", () => {
    expect(resolveDefaultScopeArea(2124)).toEqual({
      kind: "country",
      locationCode: 2124,
      label: "Canada",
      parentCountryCode: 2124,
    });
  });

  it("degrades to the bare code as its own label rather than throwing or swapping countries", () => {
    // Should never happen in practice (useProjectMarket only ever produces a
    // LOCATION_OPTIONS code), but a render path must survive it regardless.
    expect(resolveDefaultScopeArea(999999)).toEqual({
      kind: "country",
      locationCode: 999999,
      label: "999999",
      parentCountryCode: 999999,
    });
  });
});

describe("resolveActiveScopeArea", () => {
  it("prefers the confirmed area when one exists", () => {
    expect(resolveActiveScopeArea(DFW, 2840)).toEqual(DFW);
  });

  it("falls back to the country default when nothing is confirmed", () => {
    expect(resolveActiveScopeArea(null, 2840)).toEqual({
      kind: "country",
      locationCode: 2840,
      label: "United States",
      parentCountryCode: 2840,
    });
  });
});

describe("resolveEffectiveScopeArea", () => {
  it("keeps a sub-country area whose parent country matches the run's country", () => {
    expect(resolveEffectiveScopeArea(DFW, 2840)).toEqual(DFW);
  });

  it("drops a sub-country area whose parent country does not match the run's country", () => {
    // The exact mismatch resolveRunGeo guards against: a DFW metro must not
    // ride along into a run going to Canada. The picker has to SHOW that,
    // not claim a metro the request will never use.
    expect(resolveEffectiveScopeArea(DFW, 2124)).toEqual({
      kind: "country",
      locationCode: 2124,
      label: "Canada",
      parentCountryCode: 2124,
    });
  });

  it("rebuilds a country-kind area from the live code rather than trusting the embedded one", () => {
    // A stale default resolved against a country the tab has since moved off.
    const staleUs: TargetArea = {
      kind: "country",
      locationCode: 2840,
      label: "United States",
      parentCountryCode: 2840,
    };
    expect(resolveEffectiveScopeArea(staleUs, 2124)).toEqual({
      kind: "country",
      locationCode: 2124,
      label: "Canada",
      parentCountryCode: 2124,
    });
  });

  it("returns the matching country unchanged when the codes already agree", () => {
    const us: TargetArea = {
      kind: "country",
      locationCode: 2840,
      label: "United States",
      parentCountryCode: 2840,
    };
    expect(resolveEffectiveScopeArea(us, 2840)).toEqual(us);
  });

  it("keeps a city area the same way it keeps a metro", () => {
    // Miami, Florida -- verified against seeded production data.
    const miami: TargetArea = {
      kind: "city",
      locationCode: 1015116,
      label: "Miami, Florida",
      parentCountryCode: 2840,
    };
    expect(resolveEffectiveScopeArea(miami, 2840)).toEqual(miami);
  });
});
