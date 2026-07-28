import type { InsightTone } from "@/client/components/InsightTile";
import type { GbpCheck, GbpCheckStatus } from "./gbpAudit";

/**
 * States the score's basis whenever it rests on less than the full check
 * set: computeScore (gbpAudit.ts) excludes `unknown` checks from the
 * denominator entirely, so a profile with a few unknowns can still show a
 * clean-looking "100" while some fraction of it was never actually seen.
 * Naming the fraction here is what stops that number from overclaiming.
 *
 * Returns undefined once every check was evaluable: "10 of 10 checks
 * evaluated" would just restate the full-marks score two ways, so silence
 * is the more honest choice there (mirrors why a null score already gets no
 * "0 of 10" -- see scoreUnknownHint in GbpAuditCard.tsx).
 */
export function scoreBasisHint(checks: GbpCheck[]): string | undefined {
  const evaluated = checks.filter((check) => check.status !== "unknown").length;
  if (evaluated === checks.length) return undefined;
  return `${evaluated} of ${checks.length} checks evaluated`;
}

/**
 * Pure presentation rules for the GBP audit card, split out from
 * GbpAuditCard.tsx because Vitest here only collects `src/**\/*.test.ts` --
 * a `.tsx` component gets no test coverage at all, so any logic worth
 * verifying on its own (display ordering, status-to-tone mapping) has to
 * live in a plain module instead, or it would ship untested.
 */

/**
 * buildGbpAudit sorts checks by weight, for SCORING purposes: the size of
 * the gap a dimension represents, not today's pass/fail state. Display has
 * a different rule -- unknown checks are gaps in OUR data, not failings of
 * the profile, so they must never sit ahead of (or read as equally severe
 * as) a real fail/warn just because their dimension happens to carry more
 * weight. An unclaimed-profile check being unknown (weight 100, the
 * highest of any check) would otherwise lead the whole list ahead of a
 * genuine phone-number failure. This reorders for display only: known
 * checks (pass/warn/fail) keep their existing weight-descending order,
 * unknown checks move to the end, keeping their own relative order.
 */
export function orderChecksForDisplay(checks: GbpCheck[]): GbpCheck[] {
  const known = checks.filter((check) => check.status !== "unknown");
  const unknown = checks.filter((check) => check.status === "unknown");
  return [...known, ...unknown];
}

/**
 * Status -> tone, matching the tone convention already established by
 * InsightTile/NextStepsCard: fail reads as an error, warn as a warning,
 * pass as success. unknown is deliberately neutral rather than any tone
 * that reads as a problem -- it means our data is incomplete, not that the
 * profile itself is bad.
 */
export const CHECK_STATUS_TONE: Record<GbpCheckStatus, InsightTone> = {
  pass: "success",
  warn: "warning",
  fail: "error",
  unknown: "neutral",
};

/** Coarser than the per-check pass/warn/fail point values (100/50/0): the
 *  headline tile is a single glance-level signal, not another check, so it
 *  only needs to answer "roughly how is this profile doing", not draw
 *  another precise line next to the real per-check thresholds. */
const SCORE_TONE_SUCCESS_MIN = 80;
const SCORE_TONE_WARNING_MIN = 50;

/** Tone for the headline score tile. `null` (too little known to score
 *  honestly) is neutral, matching the em dash it is paired with -- never a
 *  color implying good or bad news the data doesn't actually support. */
export function scoreTone(score: number | null): InsightTone {
  if (score == null) return "neutral";
  if (score >= SCORE_TONE_SUCCESS_MIN) return "success";
  if (score >= SCORE_TONE_WARNING_MIN) return "warning";
  return "error";
}
