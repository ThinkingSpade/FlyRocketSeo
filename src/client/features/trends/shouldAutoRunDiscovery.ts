/**
 * Whether to spend money without being asked.
 *
 * This tab is the ONE place in this app that auto-runs a paid call, at the
 * user's explicit request: run once per project, then serve the stored copy
 * forever until they click re-run. Everything below exists to keep "once"
 * actually meaning once.
 *
 * The durable guard is the analysis_runs row, reached here as `outcome`.
 * `alreadyAttempted` is only a within-mount latch to stop a second render
 * firing before the first request resolves -- it is NOT the guard, and it must
 * never become the guard, because component state resets on every navigation
 * and would bill on every visit.
 */

export type RestoreOutcomeName = "none" | "expired" | "unreadable" | "ready";

export function shouldAutoRunDiscovery(input: {
  /** `useAutoRestoredRun`'s outcome; null while the restore is in flight. */
  outcome: RestoreOutcomeName | null;
  /**
   * `useAutoRestoredRun`'s `isError`. A STALE outcome is worse than an absent
   * one, and this is the only input that can tell the two apart.
   *
   * `outcome` is derived from `query.data` alone (useAutoRestoredRun.ts) and
   * never consults `query.isError`. query-core keeps `state.data` when a
   * refetch errors (query.js) -- and the paid call's own `onSettled`
   * invalidation cannot surface that error either, because `refetchQueries`
   * wraps the fetch in `.catch(noop)` (queryClient.js), so a FAILED refetch
   * still resolves and the mutation still reports success. The next mount
   * then reads the stale pre-call `"none"` and, without this input, would
   * fire a second paid Labs call for a project that was just billed --
   * while the card, which DOES see `isError`, renders "Nothing was
   * charged."
   *
   * A fresh mount whose restore errors with no stale data is already safe
   * (`outcome` is null there); this closes the stale-data case specifically.
   */
  restoreFailed: boolean;
  hasDomain: boolean;
  hasCredits: boolean;
  alreadyAttempted: boolean;
}): boolean {
  // Null means we do not yet know whether a run exists. Spending on a
  // maybe is exactly the bug this function prevents.
  if (input.outcome !== "none") return false;
  // A "none" we cannot trust is a maybe, and gets the same answer.
  if (input.restoreFailed) return false;
  if (input.alreadyAttempted) return false;
  if (!input.hasDomain) return false;
  // No credits is not a transient error to retry through -- the call would
  // fail, and a failed DataForSEO task can still be billed.
  if (!input.hasCredits) return false;
  return true;
}
