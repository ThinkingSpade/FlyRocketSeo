import { describe, expect, it } from "vitest";
import type { TargetArea } from "@/shared/geo/types";
import {
  resolveInitialConfigArea,
  resolveStoredConfigArea,
} from "./rankTrackingConfigArea";

const DFW_AREA: TargetArea = {
  kind: "metro",
  locationCode: 200623,
  label: "Dallas-Ft. Worth, TX",
  parentCountryCode: 2840,
};

describe("resolveStoredConfigArea", () => {
  it("resolves a real LOCATION_OPTIONS country code to its genuine label", () => {
    expect(resolveStoredConfigArea(2840)).toEqual({
      kind: "country",
      locationCode: 2840,
      label: "United States",
      parentCountryCode: 2840,
    });
  });

  it("falls back to an honest bare-code label for a non-country code, never a guessed name", () => {
    // 200623 (the real Dallas-Ft. Worth DMA code) is not in LOCATION_OPTIONS
    // (a country-only table) -- this is the only client-side path that can
    // reach a config's stored non-country code without a new server lookup.
    expect(resolveStoredConfigArea(200623)).toEqual({
      kind: "city",
      locationCode: 200623,
      label: "Location #200623",
      parentCountryCode: 200623,
    });
  });
});

describe("resolveInitialConfigArea", () => {
  it("an existing config's own stored location always wins over the live default", () => {
    // Even though defaultArea says Dallas-Ft. Worth, an existing US tracker
    // must keep saying US -- editing must never silently re-scope it to
    // wherever the project's confirmed area has since moved on to.
    expect(
      resolveInitialConfigArea({
        existingLocationCode: 2840,
        defaultArea: DFW_AREA,
      }),
    ).toEqual({
      kind: "country",
      locationCode: 2840,
      label: "United States",
      parentCountryCode: 2840,
    });
  });

  it("a brand-new config takes the confirmed scope as its own default", () => {
    expect(
      resolveInitialConfigArea({
        existingLocationCode: null,
        defaultArea: DFW_AREA,
      }),
    ).toEqual(DFW_AREA);
  });

  it("a brand-new config with no confirmed scope falls back to national US", () => {
    expect(
      resolveInitialConfigArea({
        existingLocationCode: null,
        defaultArea: null,
      }),
    ).toEqual({
      kind: "country",
      locationCode: 2840,
      label: "United States",
      parentCountryCode: 2840,
    });
  });
});
