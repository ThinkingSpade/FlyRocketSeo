import type { PlanStatus } from "@/client/features/billing/plan-detection";

/**
 * Whether a metered rank check may be offered, and why not when it may not.
 *
 * Pure so the money decision can be tested without a billing provider. Two
 * separate answers come out of one pass because they are NOT the same
 * question: `blockedReason` gates the spend and must resolve on uncertainty,
 * while `showFreePlanAlert` makes a claim about the user's plan and may only
 * fire when that claim is known to be true.
 */
type RankCheckAvailability = {
  /** Null when the check may be offered; otherwise the sentence to show. */
  blockedReason: string | null;
  /** Only when the plan is KNOWN to be free -- never on a failed read. */
  showFreePlanAlert: boolean;
};

export function resolveRankCheckAvailability(args: {
  /** Unmetered self-host: there is no plan, so there is nothing to gate on. */
  billingDisabled: boolean;
  planReadFailed: boolean;
  /** Null while the read is in flight, or before a session exists. */
  planStatus: PlanStatus | null;
  keywordCount: number;
}): RankCheckAvailability {
  if (!args.billingDisabled) {
    // Fails CLOSED, deliberately. The previous shape was
    // `isFreePlan = !!data && status === "free"`, so a billing read that
    // errored produced `false` -- the FreePlanAlert vanished and a paid
    // action was offered to a free-plan user on the strength of a request
    // that never came back. Uncertainty about who is paying must cost the
    // button, not the user.
    if (args.planReadFailed) {
      return {
        blockedReason:
          "We couldn't confirm your plan, so paid checks are paused. Reload to try again.",
        showFreePlanAlert: false,
      };
    }
    if (args.planStatus === null) {
      return { blockedReason: "Checking your plan…", showFreePlanAlert: false };
    }
    if (args.planStatus === "free") {
      return {
        blockedReason: "Rank checks are part of the paid plan.",
        showFreePlanAlert: true,
      };
    }
  }

  // The click used to be swallowed by `if (count > 0)` in the parent: an
  // enabled menu item that did nothing, with no toast and no explanation.
  if (args.keywordCount <= 0) {
    return {
      blockedReason: "Add keywords to this domain before running a check.",
      showFreePlanAlert: false,
    };
  }

  return { blockedReason: null, showFreePlanAlert: false };
}
