import { describe, expect, it } from "vitest";
import { scopeReviewsToBusiness, type ScopedReviews } from "./gbpReviewsScope";

/** Business A: fully replied to, so a bug that leaks this into business B's
 *  audit is loud and easy to spot (100% response rate, not some ambiguous
 *  partial number). */
const BUSINESS_A_REVIEWS: ScopedReviews = {
  businessKey: "place-A",
  reviews: Array.from({ length: 10 }, () => ({
    ownerAnswer: "Thanks for the feedback!",
  })),
};

describe("scopeReviewsToBusiness", () => {
  it("returns undefined when nothing has been stored yet", () => {
    expect(scopeReviewsToBusiness(null, "place-B")).toBeUndefined();
  });

  it("returns undefined when the business on screen has no key of its own", () => {
    expect(scopeReviewsToBusiness(BUSINESS_A_REVIEWS, null)).toBeUndefined();
  });

  it("returns the stored reviews when they were crawled for the business on screen", () => {
    expect(scopeReviewsToBusiness(BUSINESS_A_REVIEWS, "place-A")).toBe(
      BUSINESS_A_REVIEWS.reviews,
    );
  });

  it("discards a previous business's reviews once a different business is on screen", () => {
    // The exact failure finding 5 describes: business A loads with 10/10
    // owner replies, then business B is looked up before B's own reviews
    // have loaded. Without this scoping, B's audit would read A's 100%
    // response rate as its own.
    const result = scopeReviewsToBusiness(BUSINESS_A_REVIEWS, "place-B");
    expect(result).toBeUndefined();
    expect(result).not.toBe(BUSINESS_A_REVIEWS.reviews);
  });
});
