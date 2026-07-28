import { describe, expect, it } from "vitest";
import { formatGeoMetricLabel, geoMetricSuffix } from "./geoMetricLabel";

describe("geoMetricSuffix", () => {
  it("shows the area's own label for a local-scope figure", () => {
    expect(
      geoMetricSuffix({
        scope: "local",
        label: "Dallas-Ft. Worth, TX",
        locationCode: 200623,
      }),
    ).toBe("Dallas-Ft. Worth, TX");
  });

  it("shows the short country code for a national-scope figure", () => {
    expect(
      geoMetricSuffix({
        scope: "national",
        label: "United States",
        locationCode: 2840,
      }),
    ).toBe("US");
  });

  it("falls back to the full label when no short code is registered for the code", () => {
    expect(
      geoMetricSuffix({
        scope: "national",
        label: "Nowhere",
        locationCode: 999_999,
      }),
    ).toBe("Nowhere");
  });

  it("returns empty for an empty label rather than fabricating one", () => {
    expect(
      geoMetricSuffix({ scope: "national", label: "", locationCode: 999_999 }),
    ).toBe("");
  });
});

describe("formatGeoMetricLabel", () => {
  it("appends the muted suffix with a middle dot, matching the design spec's examples", () => {
    expect(
      formatGeoMetricLabel("Volume", {
        scope: "local",
        label: "Dallas-Ft. Worth, TX",
        locationCode: 200623,
      }),
    ).toBe("Volume · Dallas-Ft. Worth, TX");
    expect(
      formatGeoMetricLabel("Difficulty", {
        scope: "national",
        label: "United States",
        locationCode: 2840,
      }),
    ).toBe("Difficulty · US");
  });

  it("returns the bare metric label rather than a dangling separator when there is no geo label", () => {
    expect(
      formatGeoMetricLabel("Volume", {
        scope: "national",
        label: "",
        locationCode: 999_999,
      }),
    ).toBe("Volume");
  });
});
