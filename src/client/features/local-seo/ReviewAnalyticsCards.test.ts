import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewAnalyticsCards } from "./ReviewAnalyticsCards";

// Mirrors GbpNotConfiguredCard.test.ts/GbpLocationPicker.test.ts's own
// renderToStaticMarkup recipe -- this is a pure presentational component (no
// hooks, no server-function/react-query imports), so it renders directly
// without mocking anything.
const REVIEW = {
  rating: 5,
  timestamp: "2026-01-01T00:00:00.000Z",
  ownerAnswer: null,
  reviewId: "r1",
  author: "A. Customer",
  timeAgo: "1 week ago",
  text: "Great service",
};

/**
 * Final wave item 5: these two strings asserted causal effects this feature
 * does not measure -- "Reply to protect the rating" claims replying affects
 * the rating, and "Steady flow beats bursts for local rankings" was emitted
 * for ANY nonempty review set, regardless of whether the crawled velocity
 * was actually steady or bursty. Same defect class as the Group B GBP-audit
 * softenings on this branch (pre-dates this branch, fixed anyway). Softened
 * to observation/widely-held-practice, not deleted -- the guidance itself
 * is still worth keeping.
 */
describe("ReviewAnalyticsCards causal-claim softening (final wave item 5)", () => {
  const markup = renderToStaticMarkup(
    createElement(ReviewAnalyticsCards, { reviews: [REVIEW] }),
  );

  it("does not assert that replying protects the rating", () => {
    expect(markup).not.toContain("Reply to protect the rating");
  });

  it("does not assert that a steady review flow beats bursts for local rankings", () => {
    expect(markup).not.toContain(
      "Steady flow beats bursts for local rankings.",
    );
  });

  it("still keeps both pieces of guidance, softened to observation rather than deleted", () => {
    expect(markup.toLowerCase()).toContain("protect the rating");
    expect(markup.toLowerCase()).toContain("local rankings");
  });
});
