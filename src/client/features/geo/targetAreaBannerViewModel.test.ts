import { describe, expect, it } from "vitest";
import {
  buildTargetAreaBannerViewModel,
  describeExtraAreas,
  describeTargetAreaSource,
} from "./targetAreaBannerViewModel";
import type { TargetAreaResult } from "@/server/features/geo/services/TargetAreaService";
import type { TargetArea } from "@/shared/geo/types";

// The real Dallas-Ft. Worth DMA code, verified against seeded production data
// (see the activation plan's "Two facts discovered from the seeded data").
// Matches detectTargetArea.test.ts's own fixture.
const DFW: TargetArea = {
  kind: "metro",
  locationCode: 200623,
  label: "Dallas-Ft. Worth, TX",
  parentCountryCode: 2840,
};

// Arbitrary, clearly-fake codes for a second/third distinct area -- only
// their IDENTITY matters here, never a real geotarget.
const AUSTIN: TargetArea = {
  kind: "metro",
  locationCode: 900001,
  label: "Austin, TX",
  parentCountryCode: 2840,
};
const HOUSTON: TargetArea = {
  kind: "metro",
  locationCode: 900002,
  label: "Houston, TX",
  parentCountryCode: 2840,
};

describe("buildTargetAreaBannerViewModel", () => {
  it("returns null when there is no signal at all", () => {
    expect(buildTargetAreaBannerViewModel(null)).toBeNull();
  });

  it("returns null once an area is already confirmed -- the banner must disappear, never re-offer", () => {
    const confirmed: TargetAreaResult = {
      confirmed: true,
      area: DFW,
      source: "gbp",
      confirmedAt: "2026-07-28T00:00:00.000Z",
    };
    expect(buildTargetAreaBannerViewModel(confirmed)).toBeNull();
  });

  it("surfaces a single gbp proposal with no disagreement", () => {
    const result: TargetAreaResult = {
      confirmed: false,
      proposal: {
        multi: false,
        area: DFW,
        source: "gbp",
        gscDisagreement: null,
      },
    };
    expect(buildTargetAreaBannerViewModel(result)).toEqual({
      area: DFW,
      source: "gbp",
      extraAreaCount: 0,
      disagreement: null,
    });
  });

  it("carries a gbp/gsc disagreement through unchanged", () => {
    const result: TargetAreaResult = {
      confirmed: false,
      proposal: {
        multi: false,
        area: DFW,
        source: "gbp",
        gscDisagreement: AUSTIN,
      },
    };
    expect(buildTargetAreaBannerViewModel(result)?.disagreement).toEqual(
      AUSTIN,
    );
  });

  it("surfaces a single gsc proposal (no GBP at all)", () => {
    const result: TargetAreaResult = {
      confirmed: false,
      proposal: {
        multi: false,
        area: DFW,
        source: "gsc",
        gscDisagreement: null,
      },
    };
    expect(buildTargetAreaBannerViewModel(result)).toEqual({
      area: DFW,
      source: "gsc",
      extraAreaCount: 0,
      disagreement: null,
    });
  });

  it("collapses a multi-location proposal to its most-confident area plus a count, never a disagreement", () => {
    const result: TargetAreaResult = {
      confirmed: false,
      proposal: {
        multi: true,
        areas: [DFW, AUSTIN, HOUSTON],
        source: "gsc",
      },
    };
    expect(buildTargetAreaBannerViewModel(result)).toEqual({
      area: DFW,
      source: "gsc",
      extraAreaCount: 2,
      disagreement: null,
    });
  });

  it("returns null for a malformed empty multi-area proposal rather than fabricating an area", () => {
    const result: TargetAreaResult = {
      confirmed: false,
      proposal: {
        multi: true,
        areas: [],
        source: "gsc",
      },
    };
    expect(buildTargetAreaBannerViewModel(result)).toBeNull();
  });
});

describe("describeTargetAreaSource", () => {
  it("names the Google Business Profile for a gbp-sourced proposal", () => {
    expect(describeTargetAreaSource("gbp")).toBe(
      "your Google Business Profile",
    );
  });

  it("names Search Console for a gsc-sourced proposal -- never the GBP wording when there is no profile", () => {
    expect(describeTargetAreaSource("gsc")).toBe(
      "your Search Console activity",
    );
  });
});

describe("describeExtraAreas", () => {
  it("returns null when there is nothing extra to mention", () => {
    expect(describeExtraAreas(0)).toBeNull();
  });

  it("singularizes exactly one extra area", () => {
    expect(describeExtraAreas(1)).toBe("and 1 more area");
  });

  it("pluralizes more than one extra area", () => {
    expect(describeExtraAreas(2)).toBe("and 2 more areas");
  });
});
