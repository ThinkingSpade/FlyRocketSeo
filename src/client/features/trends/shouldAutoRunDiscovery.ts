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
  hasDomain: boolean;
  hasCredits: boolean;
  alreadyAttempted: boolean;
}): boolean {
  // Null means we do not yet know whether a run exists. Spending on a
  // maybe is exactly the bug this function prevents.
  if (input.outcome !== "none") return false;
  if (input.alreadyAttempted) return false;
  if (!input.hasDomain) return false;
  // No credits is not a transient error to retry through -- the call would
  // fail, and a failed DataForSEO task can still be billed.
  if (!input.hasCredits) return false;
  return true;
}
