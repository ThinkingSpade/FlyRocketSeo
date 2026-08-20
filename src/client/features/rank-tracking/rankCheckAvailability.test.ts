import { describe, expect, it } from "vitest";
import { resolveRankCheckAvailability } from "./rankCheckAvailability";

const paidWithKeywords = {
  billingDisabled: false,
  planReadFailed: false,
  planStatus: "paid" as const,
  keywordCount: 12,
};

describe("resolveRankCheckAvailability", () => {
  it("offers the check to a paid plan with keywords", () => {
    expect(resolveRankCheckAvailability(paidWithKeywords)).toEqual({
      blockedReason: null,
      showFreePlanAlert: false,
    });
  });

  it("blocks the check when the billing read failed", () => {
    const result = resolveRankCheckAvailability({
      ...paidWithKeywords,
      planReadFailed: true,
      planStatus: null,
    });
    expect(result.blockedReason).toBeTruthy();
    // The banner asserts the user is on the free plan; a failed read is not
    // evidence of that, so it must stay hidden even though spend is blocked.
    expect(result.showFreePlanAlert).toBe(false);
  });

  it("blocks the check while the plan is still unknown", () => {
    expect(
      resolveRankCheckAvailability({
        ...paidWithKeywords,
        planStatus: null,
      }).blockedReason,
    ).toBeTruthy();
  });

  it("blocks a free plan and explains it with the alert", () => {
    const result = resolveRankCheckAvailability({
      ...paidWithKeywords,
      planStatus: "free",
    });
    expect(result.blockedReason).toBeTruthy();
    expect(result.showFreePlanAlert).toBe(true);
  });

  it("never gates on a plan when billing is disabled", () => {
    expect(
      resolveRankCheckAvailability({
        billingDisabled: true,
        planReadFailed: true,
        planStatus: null,
        keywordCount: 3,
      }),
    ).toEqual({ blockedReason: null, showFreePlanAlert: false });
  });

  it("blocks a config with no keywords rather than swallowing the click", () => {
    expect(
      resolveRankCheckAvailability({
        ...paidWithKeywords,
        keywordCount: 0,
      }).blockedReason,
    ).toBeTruthy();
  });
});
