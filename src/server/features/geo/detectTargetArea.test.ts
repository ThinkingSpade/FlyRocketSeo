import { describe, expect, it } from "vitest";
import { detectTargetArea } from "./detectTargetArea";
import type { TargetArea } from "@/shared/geo/types";

// The real Dallas-Ft. Worth DMA code, verified against seeded production data
// (see the activation plan's "Two facts discovered from the seeded data").
// Plan 1's tests invented 1026339 for the same metro; do not propagate that
// here.
const DFW: TargetArea = {
  kind: "metro",
  locationCode: 200623,
  label: "Dallas-Ft. Worth, TX",
  parentCountryCode: 2840,
};

// Arbitrary, clearly-fake codes for a second/third distinct area -- only
// their IDENTITY (different locationCode from DFW and each other) and
// ordering matter to these tests, never a real geotarget.
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

describe("detectTargetArea", () => {
  it("proposes the GBP candidate, sourced gbp, when GBP resolved one", () => {
    const proposal = detectTargetArea({
      gbpCandidate: DFW,
      gscCandidates: [],
    });
    expect(proposal).toMatchObject({
      multi: false,
      area: DFW,
      source: "gbp",
      gscDisagreement: null,
    });
  });

  it("proposes the single GSC candidate, sourced gsc, when there is no GBP signal", () => {
    const proposal = detectTargetArea({
      gbpCandidate: null,
      gscCandidates: [DFW],
    });
    expect(proposal).toMatchObject({
      multi: false,
      area: DFW,
      source: "gsc",
      gscDisagreement: null,
    });
  });

  it("proposes a MULTI-area result when GSC evidence names several distinct cities", () => {
    const proposal = detectTargetArea({
      gbpCandidate: null,
      gscCandidates: [DFW, AUSTIN, HOUSTON],
    });
    expect(proposal).toMatchObject({
      multi: true,
      source: "gsc",
      areas: [DFW, AUSTIN, HOUSTON],
    });
  });

  it("never offers multi-location for a single-location business", () => {
    // The spec's own rule: multi-location only when detection actually finds
    // several. A single GBP or single-city GSC result must always come back
    // `multi: false`, never a one-item "multi" proposal.
    const gbpOnly = detectTargetArea({ gbpCandidate: DFW, gscCandidates: [] });
    const gscOnly = detectTargetArea({
      gbpCandidate: null,
      gscCandidates: [DFW],
    });
    expect(gbpOnly?.multi).toBe(false);
    expect(gscOnly?.multi).toBe(false);
  });

  it("returns null when neither signal produced anything -- never a fabricated guess", () => {
    expect(
      detectTargetArea({ gbpCandidate: null, gscCandidates: [] }),
    ).toBeNull();
  });

  it("returns null when a raw signal existed but resolved to no seeded row", () => {
    // The caller already tried to map a declared city / landing-page city to
    // geo_locations and found nothing -- from this module's point of view
    // that is IDENTICAL to no signal at all (both arrive as null/empty), and
    // it must resolve the same way: null, not an invented code.
    expect(
      detectTargetArea({ gbpCandidate: null, gscCandidates: [] }),
    ).toBeNull();
  });

  it("prefers GBP over GSC when they disagree, and records that GSC differed", () => {
    const proposal = detectTargetArea({
      gbpCandidate: DFW,
      gscCandidates: [AUSTIN],
    });
    expect(proposal).toMatchObject({
      multi: false,
      area: DFW,
      source: "gbp",
      gscDisagreement: AUSTIN,
    });
  });

  it("records no disagreement when GBP and GSC name the same area", () => {
    const proposal = detectTargetArea({
      gbpCandidate: DFW,
      gscCandidates: [DFW],
    });
    expect(proposal && !proposal.multi && proposal.gscDisagreement).toBeNull();
  });

  it("de-dupes GSC candidates by locationCode -- repeat evidence for the same area is not 'several distinct cities'", () => {
    const proposal = detectTargetArea({
      gbpCandidate: null,
      gscCandidates: [DFW, { ...DFW }, DFW],
    });
    expect(proposal).toMatchObject({ multi: false, area: DFW, source: "gsc" });
  });

  it("keeps the caller's ordering in a multi-area proposal", () => {
    const proposal = detectTargetArea({
      gbpCandidate: null,
      gscCandidates: [HOUSTON, DFW, AUSTIN],
    });
    expect(proposal).toMatchObject({
      multi: true,
      areas: [HOUSTON, DFW, AUSTIN],
    });
  });
});
