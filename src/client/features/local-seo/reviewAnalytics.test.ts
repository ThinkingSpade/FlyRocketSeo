import { describe, expect, it } from "vitest";
import { computeReviewAnalytics, selectNeedsResponse } from "./reviewAnalytics";

const NOW = Date.UTC(2026, 6, 15); // Jul 15, 2026

function review(
  rating: number | null,
  daysAgo: number | null,
  ownerAnswer: string | null = null,
  text: string | null = "text",
) {
  return {
    rating,
    timestamp:
      daysAgo == null
        ? null
        : new Date(NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    ownerAnswer,
    text,
  };
}

describe("computeReviewAnalytics", () => {
  it("aggregates rating distribution, response rate, and recency", () => {
    const analytics = computeReviewAnalytics(
      [
        review(5, 10, "thanks!"),
        review(5, 50),
        review(4, 100),
        review(2, 5),
        review(1, 400, "sorry"),
      ],
      NOW,
    );

    expect(analytics.reviewCount).toBe(5);
    expect(analytics.averageRating).toBeCloseTo(3.4);
    expect(analytics.distribution).toEqual([2, 1, 0, 1, 1]);
    expect(analytics.responseRate).toBeCloseTo(2 / 5);
    // The 2★ five days ago has no reply; the 1★ has one.
    expect(analytics.unansweredNegativeCount).toBe(1);
    expect(analytics.last90DaysCount).toBe(3);
  });

  it("builds a trailing-12-month velocity series", () => {
    const analytics = computeReviewAnalytics(
      [review(5, 3), review(4, 8), review(3, 45), review(5, 500)],
      NOW,
    );
    expect(analytics.velocity).toHaveLength(12);
    const july = analytics.velocity[11];
    expect(july.label).toBe("Jul");
    expect(july.count).toBe(2);
    // The 500-day-old review falls outside the window entirely.
    const total = analytics.velocity.reduce((sum, m) => sum + m.count, 0);
    expect(total).toBe(3);
  });

  it("handles an empty set", () => {
    const analytics = computeReviewAnalytics([], NOW);
    expect(analytics.averageRating).toBeNull();
    expect(analytics.responseRate).toBeNull();
    expect(analytics.velocity.every((m) => m.count === 0)).toBe(true);
  });
});

describe("selectNeedsResponse", () => {
  it("keeps unanswered negatives, newest first", () => {
    const rows = selectNeedsResponse([
      review(2, 30),
      review(1, 2),
      review(3, 10, "we replied"),
      review(5, 1),
      review(3, null),
    ]);
    expect(rows.map((row) => row.rating)).toEqual([1, 2, 3]);
  });
});
