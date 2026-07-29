import { describe, expect, it } from "vitest";
import {
  resolveActiveScopeArea,
  resolveDefaultScopeArea,
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
