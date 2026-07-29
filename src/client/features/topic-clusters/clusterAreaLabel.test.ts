import { describe, expect, it } from "vitest";
import {
  captureClusterAreaLabel,
  extractStoredConfirmedAreaLabel,
} from "./clusterAreaLabel";
import type { TargetArea } from "@/shared/geo/types";

const US = 2840;

const COUNTRY_AREA: TargetArea = {
  kind: "country",
  locationCode: US,
  label: "United States",
  parentCountryCode: US,
};

const DFW: TargetArea = {
  kind: "metro",
  locationCode: 200623,
  label: "Dallas-Ft. Worth, TX",
  parentCountryCode: US,
};

describe("captureClusterAreaLabel", () => {
  it("returns the confirmed area's label when a sub-country area is confirmed", () => {
    expect(captureClusterAreaLabel(true, DFW)).toBe("Dallas-Ft. Worth, TX");
  });

  it("returns null when nothing is confirmed, regardless of the area shown", () => {
    // The header control still shows SOMETHING (the country fallback) even
    // with nothing confirmed -- that is not a mismatch worth a caveat.
    expect(captureClusterAreaLabel(false, DFW)).toBeNull();
  });

  it("returns null for a plain country area even if 'confirmed'", () => {
    // A country-kind area is the ordinary default, never a metro mismatch --
    // see this module's own header on why only a sub-country kind counts.
    expect(captureClusterAreaLabel(true, COUNTRY_AREA)).toBeNull();
  });
});

describe("extractStoredConfirmedAreaLabel", () => {
  it("reads back exactly what was captured for that run", () => {
    const params = {
      topic: "coffee",
      locationCode: US,
      confirmedAreaLabel: "Dallas-Ft. Worth, TX",
    };
    expect(extractStoredConfirmedAreaLabel(params)).toBe(
      "Dallas-Ft. Worth, TX",
    );
  });

  it("reads back null when that run captured no confirmed area", () => {
    const params = {
      topic: "coffee",
      locationCode: US,
      confirmedAreaLabel: null,
    };
    expect(extractStoredConfirmedAreaLabel(params)).toBeNull();
  });

  it("degrades to null for a run recorded before this field existed", () => {
    const params = { topic: "coffee", locationCode: US };
    expect(extractStoredConfirmedAreaLabel(params)).toBeNull();
  });

  it("degrades to null for non-object params", () => {
    expect(extractStoredConfirmedAreaLabel(null)).toBeNull();
    expect(extractStoredConfirmedAreaLabel("not an object")).toBeNull();
  });

  it("degrades to null for a wrong-typed field rather than throwing", () => {
    expect(
      extractStoredConfirmedAreaLabel({ confirmedAreaLabel: 12345 }),
    ).toBeNull();
  });
});
