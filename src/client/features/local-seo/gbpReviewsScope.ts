/**
 * Ties a set of already-loaded reviews to the business they were crawled
 * for. LocalReviewsSection's review crawl is user-triggered (a button, not
 * an effect that fires the instant a new business loads) and reports
 * completed reviews upward through a plain callback, so there is no single
 * moment where "the business on screen changed" and "the parent's stored
 * reviews got reset" are guaranteed to happen together -- a remount driven
 * by a `key` change resets LocalReviewsSection's own internal state, but not
 * whatever the parent already holds above it.
 *
 * Tagging stored reviews with the business they belong to, and re-deriving
 * what's usable on every render (scopeReviewsToBusiness) instead of trying
 * to reset them in an effect, is what closes that gap: a previous business's
 * replies can never be read as a newly looked-up business's own, even for
 * the single render before any effect would have had a chance to clean up
 * after itself.
 */
export type ScopedReviews = {
  /** Identity of the business `reviews` was actually crawled for -- Google's
   *  `placeId`/`cid` when available, otherwise the lookup keyword. See
   *  scopeReviewsToBusiness for how this is compared. */
  businessKey: string;
  reviews: Array<{ ownerAnswer: string | null }>;
};

/**
 * The reviews to feed the GBP audit's owner-response check for whichever
 * business is on screen right now: `stored`'s reviews if they were crawled
 * for `currentBusinessKey`, or `undefined` -- buildGbpAudit's existing
 * "reviews not loaded yet" signal, already `status: "unknown"` -- for
 * anything else. A business with no key of its own (nothing looked up yet)
 * never receives a stale set of reviews, since `undefined` can't equal any
 * stored key.
 */
export function scopeReviewsToBusiness(
  stored: ScopedReviews | null,
  currentBusinessKey: string | null,
): Array<{ ownerAnswer: string | null }> | undefined {
  if (stored == null || currentBusinessKey == null) return undefined;
  return stored.businessKey === currentBusinessKey ? stored.reviews : undefined;
}
