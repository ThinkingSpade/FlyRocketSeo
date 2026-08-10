import type { KeywordDiscoveryResult } from "@/types/schemas/keyword-discovery";
import type { ResolvedGeo } from "@/shared/geo/types";
import type { RestoreOutcomeName } from "./shouldAutoRunDiscovery";

/**
 * Pure decision logic pulled out of useKeywordTargets.ts specifically so it
 * gets real test coverage. Vitest runs in `node` and cannot render a hook,
 * so anything that stays hook-shaped ships untested by design -- but both
 * functions below encode a defect this codebase has already shipped once
 * (see each function's own comment), so leaving them untestable was how
 * that defect got in in the first place.
 */

export type PaidState =
  | "ok"
  | "none"
  | "failed"
  | "expired"
  | "no-domain"
  | "no-credits";

/**
 * What to tell the user about the paid half, in priority order.
 *
 * `isError` is checked BEFORE `active?.status === "ok"` on purpose. `active`
 * falls back to the last successful result -- this mount's own `fresh`, or a
 * restored one -- even while a NEWER attempt (a "Run again" click) is
 * failing. Checking `ok` first used to mean a failed re-run was invisible:
 * the stale "ok" data was still sitting in `active`, so `paidState` stayed
 * "ok" and the user saw nothing change even though a paid call had just
 * failed (and may already have been billed). `isError` is specifically the
 * CURRENT mutation's own failure, a live call that threw this mount;
 * `active?.status === "failed"` is a separate, independent case -- a
 * *restored* run that was itself recorded as a failure, where `isError` is
 * false because no live call happened this mount at all.
 */
export function resolvePaidState(input: {
  domain: string | null;
  active: KeywordDiscoveryResult | null;
  /** The CURRENT mutation attempt's own error state -- not `active`, which
   *  only ever holds a successful/restored result, never a live failure. */
  isError: boolean;
  outcome: RestoreOutcomeName | null;
  hasCredits: boolean;
}): PaidState {
  if (input.domain == null) return "no-domain";
  if (input.isError) return "failed";
  if (input.active?.status === "ok") return "ok";
  if (input.active?.status === "failed") return "failed";
  if (input.outcome === "expired" || input.outcome === "unreadable") {
    return "expired";
  }
  if (!input.hasCredits) return "no-credits";
  return "none";
}

/**
 * Which geography labels the currently-displayed rows.
 *
 * Deliberately keyed on `fresh` (the RESULT), not on whether `freshGeo`
 * happens to be non-null: `fresh` and `freshGeo` must only ever be set
 * together, in the same `onSuccess` callback, from that SAME call's own
 * mutation variables (see useKeywordTargets.ts's own comment on why setting
 * `freshGeo` any earlier -- e.g. eagerly in `start()`, before the call
 * resolves -- let a FAILED re-run under a new scope mislabel the still-
 * displayed rows from the PREVIOUS successful run with the NEW scope's
 * geography). Gating on `fresh` here is a second line of defense: even if a
 * future edit somehow desyncs the two, a null `fresh` still falls back to
 * `restoredGeo` rather than surfacing a `freshGeo` nothing actually vouches
 * for.
 */
export function pickDisplayGeo(
  fresh: KeywordDiscoveryResult | null,
  freshGeo: ResolvedGeo | null,
  restoredGeo: ResolvedGeo | null,
): ResolvedGeo | null {
  return fresh ? freshGeo : restoredGeo;
}
