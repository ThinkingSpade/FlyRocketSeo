// Pure review-set analytics for the Local SEO tab (no I/O), split out so
// the bucket/velocity math is unit-testable.

export type ReviewInput = {
  rating: number | null;
  /** ISO timestamp of the review, when the crawl returned one. */
  timestamp: string | null;
  ownerAnswer: string | null;
};

type ReviewAnalytics = {
  reviewCount: number;
  /** Average over reviews that carry a rating, or null. */
  averageRating: number | null;
  /** Counts for 5★ down to 1★. */
  distribution: [number, number, number, number, number];
  /** Reviews with an owner reply / total, 0..1, or null when empty. */
  responseRate: number | null;
  /** Count of ≤3★ reviews without an owner reply. */
  unansweredNegativeCount: number;
  /** Reviews dated within the trailing 90 days (undated ones excluded). */
  last90DaysCount: number;
  /** Trailing 12 calendar months, oldest first. */
  velocity: Array<{ label: string; count: number }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasReply(review: ReviewInput): boolean {
  return (review.ownerAnswer ?? "").trim() !== "";
}

/** Aggregate a crawled review set; `now` is injectable for tests. */
export function computeReviewAnalytics(
  reviews: ReviewInput[],
  now: number,
): ReviewAnalytics {
  const distribution: [number, number, number, number, number] = [
    0, 0, 0, 0, 0,
  ];
  let ratingSum = 0;
  let ratedCount = 0;
  let replied = 0;
  let unansweredNegativeCount = 0;
  let last90DaysCount = 0;

  // Trailing 12 calendar months, oldest first, keyed year-month.
  const monthKeys: string[] = [];
  const monthCounts = new Map<string, number>();
  const nowDate = new Date(now);
  for (let offset = 11; offset >= 0; offset--) {
    const d = new Date(
      Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - offset, 1),
    );
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    monthKeys.push(key);
    monthCounts.set(key, 0);
  }

  for (const review of reviews) {
    const rating = review.rating;
    if (rating != null) {
      ratingSum += rating;
      ratedCount += 1;
      const bucket = Math.min(5, Math.max(1, Math.round(rating)));
      distribution[5 - bucket] += 1;
      if (rating <= 3 && !hasReply(review)) unansweredNegativeCount += 1;
    }
    if (hasReply(review)) replied += 1;

    const timestamp = parseTimestamp(review.timestamp);
    if (timestamp != null) {
      if (now - timestamp <= 90 * DAY_MS) last90DaysCount += 1;
      const date = new Date(timestamp);
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      if (monthCounts.has(key)) {
        monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
      }
    }
  }

  return {
    reviewCount: reviews.length,
    averageRating: ratedCount > 0 ? ratingSum / ratedCount : null,
    distribution,
    responseRate: reviews.length > 0 ? replied / reviews.length : null,
    unansweredNegativeCount,
    last90DaysCount,
    velocity: monthKeys.map((key) => {
      const [, month] = key.split("-");
      return {
        label: MONTH_LABELS[Number(month)] ?? key,
        count: monthCounts.get(key) ?? 0,
      };
    }),
  };
}

type NeedsResponseReview<T> = T & { parsedTimestamp: number | null };

/** Negative (≤3★) reviews without an owner reply, newest first. */
export function selectNeedsResponse<
  T extends ReviewInput & { text: string | null },
>(reviews: T[], limit = 5): Array<NeedsResponseReview<T>> {
  return reviews
    .filter(
      (review) =>
        review.rating != null && review.rating <= 3 && !hasReply(review),
    )
    .map((review) => ({
      ...review,
      parsedTimestamp: parseTimestamp(review.timestamp),
    }))
    .toSorted((a, b) => (b.parsedTimestamp ?? -1) - (a.parsedTimestamp ?? -1))
    .slice(0, limit);
}
