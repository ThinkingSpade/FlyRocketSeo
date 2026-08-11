/**
 * How an Ahrefs free-DR answer becomes a rating, and what `null` is allowed
 * to mean.
 *
 * Extracted from `src/serverFunctions/ahrefs.ts` so the one decision that
 * actually bit a user has a test: that file is a `createServerFn` module
 * bound to `cloudflare:workers`, which this repo's node-environment Vitest
 * cannot import, so the rule had no coverage while it was wrong.
 *
 * The rule: a rating Ahrefs returns is kept verbatim, INCLUDING 0. `null` is
 * reserved for "we did not get an answer" — a non-200, a malformed body, a
 * timeout. Nothing else may produce it.
 *
 * This used to collapse 0 to null, on the theory that Ahrefs answers 200/DR 0
 * for domains it holds no rating for. Whether or not that is sometimes true,
 * the collapse destroyed the difference between "no authority" and "unknown",
 * and every consumer reads null as unknown. Concretely: americavending.com
 * rates 0, so Keyword Research announced "This project's own domain rating is
 * unknown, so there is no baseline to judge which of these keywords are
 * winnable" and switched off the whole winnable / stretch / not-yet verdict —
 * for a client whose authority was in fact known, and known to be nil. A DR of
 * 0 is the most decisive input that verdict can receive, not the absence of
 * one.
 */

/** A DR that came back from Ahrefs, or null when the lookup did not answer. */
export function ahrefsRatingFromValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
