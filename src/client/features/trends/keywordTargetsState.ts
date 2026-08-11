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
  | "unknown"
  | "failed"
  | "restore-failed"
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
 *
 * `restoreFailed` is a THIRD, distinct failure, and collapsing it into
 * "none" was a permanently stuck dead end. When `restoreLatestRun` itself
 * errors, `useAutoRestoredRun` has no `query.data`, so `outcome` is null --
 * which is also the ordinary still-loading state, and which
 * `shouldAutoRunDiscovery` (correctly) refuses to spend on. The card
 * therefore rendered no banner, no button and no error over a table of
 * GSC-only rows, and nothing on the page could ever get it out of that
 * state. It sits AFTER the `active` checks: a live run that succeeded this
 * mount is real data worth showing even if the history read is broken.
 *
 * `"unknown"` and `"none"` are then split apart for the same reason, using
 * the same convention `shouldAutoRunDiscovery` already relies on: a null
 * `outcome` means the restore has not ANSWERED yet, not that no run exists.
 * Collapsing the two would flash "Ranking data hasn't been loaded for this
 * project yet", with a button offering to spend, on every cold mount of a
 * project that has in fact already run -- for as long as the restore takes.
 * "unknown" renders nothing, exactly like the transient "no-domain".
 */
export function resolvePaidState(input: {
  domain: string | null;
  active: KeywordDiscoveryResult | null;
  /** The CURRENT mutation attempt's own error state -- not `active`, which
   *  only ever holds a successful/restored result, never a live failure. */
  isError: boolean;
  /** The RESTORE query's own error state -- we could not even find out
   *  whether this project has already run, so we must not guess. */
  restoreFailed: boolean;
  outcome: RestoreOutcomeName | null;
  hasCredits: boolean;
}): PaidState {
  if (input.domain == null) return "no-domain";
  if (input.isError) return "failed";
  if (input.active?.status === "ok") return "ok";
  if (input.active?.status === "failed") return "failed";
  if (input.restoreFailed) return "restore-failed";
  if (input.outcome === "expired" || input.outcome === "unreadable") {
    return "expired";
  }
  if (input.outcome === null) return "unknown";
  if (!input.hasCredits) return "no-credits";
  return "none";
}

/**
 * What a failed paid run actually says, and whether retrying it is honest.
 *
 * The server already classifies every failure into one of three tags
 * (`describeFailure` in
 * src/server/features/keywords/services/keywordDiscovery.ts) and persists it
 * on the run, and keyword-discovery.ts's schema calls that field "rendered".
 * It was not: one generic "Couldn't load ranking data / Try again" covered
 * every cause. That is worst for `insufficient_credits`, where "Try again"
 * offers the user a button that cannot succeed -- and a DataForSEO task can
 * be billed even when it then errors, so the offer is not merely useless.
 *
 * `canRetry: false` therefore SUPPRESSES the button rather than disabling
 * it: a disabled control still reads as "this is the way out of here", and
 * for an out-of-credits project it isn't.
 *
 * An unrecognised tag falls through to the generic branch WITH a retry --
 * `reason` is a storage format that can grow server-side, and the safe
 * default for an unknown cause is the same thing we said before this
 * function existed, not silence.
 */
export function describePaidFailure(input: {
  /** The persisted tag, or null when no failure row could be read. */
  reason: string | null;
  /** Named in the message; the card passes "your site" when unknown. */
  domain: string;
}): { message: string; canRetry: boolean } {
  if (input.reason === "insufficient_credits") {
    return {
      message: `Ranking data for ${input.domain} needs credits, and this account is out. The keywords below come from Search Console, which is free.`,
      canRetry: false,
    };
  }
  if (input.reason === "rate_limited") {
    return {
      message: `Ranking data for ${input.domain} was rate-limited. Waiting a few minutes before trying again usually clears it.`,
      canRetry: true,
    };
  }
  return {
    message: `Couldn’t load ranking data for ${input.domain}.`,
    canRetry: true,
  };
}

/**
 * Which geography labels the currently-displayed rows.
 *
 * Gated on `active?.status === "ok"` FIRST, exactly the way `fetchedAt` is,
 * because there has to be a successful run for a geography to describe. A
 * restored run recorded as `{status:"failed"}` still parses and still
 * carries its own persisted geo bundle, so without this gate the card
 * printed "Rankings in Dallas-Fort Worth TX" over a table holding nothing
 * but Search Console rows -- directly above the banner saying ranking data
 * could not be loaded. The scope line has to describe the rows actually on
 * screen or say nothing at all.
 *
 * Then keyed on `fresh` (the RESULT), not on whether `freshGeo` happens to
 * be non-null: `fresh` and `freshGeo` must only ever be set together, in the
 * same `onSuccess` callback, from that SAME call's own mutation variables
 * (see useKeywordTargets.ts's own comment on why setting `freshGeo` any
 * earlier -- e.g. eagerly in `start()`, before the call resolves -- let a
 * FAILED re-run under a new scope mislabel the still-displayed rows from the
 * PREVIOUS successful run with the NEW scope's geography). Gating on `fresh`
 * here is a second line of defense: even if a future edit somehow desyncs
 * the two, a null `fresh` still falls back to `restoredGeo` rather than
 * surfacing a `freshGeo` nothing actually vouches for.
 */
export function pickDisplayGeo(input: {
  /** `fresh ?? restored` -- the result whose rows are on screen right now. */
  active: KeywordDiscoveryResult | null;
  fresh: KeywordDiscoveryResult | null;
  freshGeo: ResolvedGeo | null;
  restoredGeo: ResolvedGeo | null;
}): ResolvedGeo | null {
  if (input.active?.status !== "ok") return null;
  return input.fresh ? input.freshGeo : input.restoredGeo;
}
