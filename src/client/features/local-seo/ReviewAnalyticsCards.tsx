import { Star } from "lucide-react";
import {
  computeReviewAnalytics,
  selectNeedsResponse,
  type ReviewInput,
} from "./reviewAnalytics";

type ReviewRow = ReviewInput & {
  reviewId: string | null;
  author: string | null;
  timeAgo: string | null;
  text: string | null;
};

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div
      className={`rounded-lg border bg-base-100 p-3 ${
        tone === "warning" ? "border-warning/50" : "border-base-300"
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-base-content/50">{hint}</div> : null}
    </div>
  );
}

/** Review-management analytics computed from the crawled review set. */
export function ReviewAnalyticsCards({ reviews }: { reviews: ReviewRow[] }) {
  const analytics = computeReviewAnalytics(reviews, Date.now());
  const needsResponse = selectNeedsResponse(reviews);
  if (analytics.reviewCount === 0) return null;

  const maxVelocity = Math.max(1, ...analytics.velocity.map((m) => m.count));
  const stars: Array<{ label: string; count: number }> =
    analytics.distribution.map((count, index) => ({
      label: `${5 - index}★`,
      count,
    }));
  const maxStar = Math.max(1, ...stars.map((s) => s.count));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Crawled average"
          value={
            analytics.averageRating != null
              ? analytics.averageRating.toFixed(2)
              : "—"
          }
          hint={`${analytics.reviewCount} reviews crawled`}
        />
        <Tile
          label="Response rate"
          value={
            analytics.responseRate != null
              ? `${Math.round(analytics.responseRate * 100)}%`
              : "—"
          }
          hint="Reviews with an owner reply"
        />
        <Tile
          label="Unanswered ≤3★"
          value={String(analytics.unansweredNegativeCount)}
          hint="Reply to protect the rating"
          tone={analytics.unansweredNegativeCount > 0 ? "warning" : undefined}
        />
        <Tile
          label="Last 90 days"
          value={String(analytics.last90DaysCount)}
          hint="Recent review velocity"
        />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body gap-2 p-4">
            <h3 className="text-sm font-semibold">Rating distribution</h3>
            <ul className="space-y-1">
              {stars.map((star) => (
                <li
                  key={star.label}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="w-8 shrink-0 text-right tabular-nums">
                    {star.label}
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-base-200">
                    <span
                      className="block h-full rounded-full bg-amber-400"
                      style={{ width: `${(star.count / maxStar) * 100}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-xs text-base-content/60 tabular-nums">
                    {star.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100">
          <div className="card-body gap-2 p-4">
            <h3 className="text-sm font-semibold">Review velocity</h3>
            <div className="flex h-24 items-end gap-1">
              {analytics.velocity.map((month, index) => (
                <div
                  key={`${month.label}-${index}`}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${month.label}: ${month.count} reviews`}
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-primary/70"
                      style={{
                        height: `${(month.count / maxVelocity) * 100}%`,
                        minHeight: month.count > 0 ? "3px" : "0px",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-base-content/50">
                    {month.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-base-content/50">
              Crawled reviews per month, trailing 12 months. Steady flow beats
              bursts for local rankings.
            </p>
          </div>
        </div>
      </div>

      {needsResponse.length > 0 ? (
        <div className="card border border-warning/40 bg-base-100">
          <div className="card-body gap-2 p-4">
            <h3 className="text-sm font-semibold">Needs a response</h3>
            <ul className="space-y-2">
              {needsResponse.map((review, index) => (
                <li
                  key={review.reviewId ?? String(index)}
                  className="rounded-lg border border-base-300 p-2.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-medium tabular-nums">
                      {review.rating}
                    </span>
                    <span className="text-base-content/60">
                      {review.author ?? "Anonymous"}
                    </span>
                    <span className="text-xs text-base-content/40">
                      {review.timeAgo ?? ""}
                    </span>
                  </div>
                  {review.text ? (
                    <p className="line-clamp-2 pt-1 text-base-content/70">
                      {review.text}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
