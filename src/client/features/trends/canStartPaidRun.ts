/**
 * Whether `runAgain`'s underlying call is allowed to fire at all -- the two
 * conditions `start()` (useKeywordTargets.ts) checks before ever touching
 * `discovery.mutate()`, pulled out here only so their ORDER is a plain
 * value comparison instead of two `if` statements buried in a `useCallback`.
 *
 * Deliberately narrow: this does NOT cover the actual money-safety fix,
 * which is that the caller must read `paidCallInFlight` from a LIVE
 * MutationCache lookup (`queryClient.isMutating`) at call time, not from a
 * value closed over at render time -- see `start`'s own comment in
 * useKeywordTargets.ts for why a rendered snapshot can go stale between a
 * click and the next re-render. Testing THIS function only proves the
 * ordering of the two conditions is right; it says nothing about whether
 * the caller fed it a fresh `paidCallInFlight` or a stale one -- that
 * staleness is a timing property no pure function can exercise.
 */
export function canStartPaidRun(input: {
  hasDomain: boolean;
  paidCallInFlight: boolean;
}): boolean {
  if (!input.hasDomain) return false;
  if (input.paidCallInFlight) return false;
  return true;
}
