import { describe, expect, it } from "vitest";

import { summariseServiceArea } from "./serviceAreaSummary";
import type { TargetArea } from "@/shared/geo/types";

const dfw: TargetArea = {
  kind: "metro",
  locationCode: 200623,
  label: "Dallas-Ft. Worth TX",
  parentCountryCode: 2840,
};
const plano: TargetArea = {
  kind: "city",
  locationCode: 1026340,
  label: "Plano, Texas",
  parentCountryCode: 2840,
};

/**
 * "Where do they sell?" recorded a shape and never named a place.
 *
 * The card's own select answers "one local area / a few areas / nationwide /
 * worldwide", which is all `serviceAreaKind` stores -- but the city that
 * shape refers to lives in `project_target_areas`, and the user could not see
 * it from the one control whose answer depends on it. A DFW operator read
 * "Nationwide" with no mention of Dallas anywhere.
 */
describe("summariseServiceArea", () => {
  it("names a confirmed area and says it is settled", () => {
    const summary = summariseServiceArea({
      confirmed: true,
      area: dfw,
      source: "gbp",
      confirmedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(summary.state).toBe("confirmed");
    expect(summary.label).toBe("Dallas-Ft. Worth TX");
    expect(summary.alternatives).toEqual([]);
  });

  it("names a single proposal but marks it unsettled", () => {
    // The distinction matters: a proposal is a guess from GBP or Search
    // Console that nobody has agreed to, and the field must not present it
    // with the same confidence as an answer the user gave.
    const summary = summariseServiceArea({
      confirmed: false,
      proposal: {
        multi: false,
        area: dfw,
        source: "gbp",
        gscDisagreement: null,
      },
    });
    expect(summary.state).toBe("proposed");
    expect(summary.label).toBe("Dallas-Ft. Worth TX");
  });

  it("leads with the most-confident of several proposed areas and lists the rest", () => {
    const summary = summariseServiceArea({
      confirmed: false,
      proposal: { multi: true, areas: [dfw, plano], source: "gsc" },
    });
    expect(summary.label).toBe("Dallas-Ft. Worth TX");
    expect(summary.alternatives).toEqual(["Plano, Texas"]);
  });

  it("has nothing to say when no area has been detected", () => {
    expect(summariseServiceArea(null)).toEqual({
      state: "none",
      label: null,
      alternatives: [],
    });
  });

  it("treats a still-loading query the same as nothing detected", () => {
    // useTargetArea's data is undefined on first render. That is "we don't
    // know yet", which must render as absence rather than as a claim.
    expect(summariseServiceArea(undefined).state).toBe("none");
  });
});
