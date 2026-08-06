import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getBusinessReviewsResult,
  startBusinessReviews,
} from "@/serverFunctions/local-seo";
import { meteredActionLabel } from "@/client/components/MeteredActionLabel";
import { ReviewAnalyticsCards } from "./ReviewAnalyticsCards";
import {
  clearReviewsTask,
  loadReviewsTask,
  REVIEWS_STALL_AFTER_MS,
  saveReviewsTask,
  type StoredReviewsTask,
} from "./reviewsTaskStore";
import { Button } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";

export function LocalReviewsSection({
  projectId,
  keyword,
  onReviewsLoaded,
}: {
  projectId: string;
  keyword: string;
  /** Reports the crawled rows upward once loaded (undefined before or
   *  between crawls) so a sibling GBP audit card can read owner-reply data
   *  without this component knowing anything about audits. Optional and
   *  side-effect-free to omit: gbpAudit.ts already treats "not supplied" as
   *  unknown rather than assuming zero replies, so callers that don't need
   *  it can simply leave it out. */
  onReviewsLoaded?: (
    reviews: Array<{ ownerAnswer: string | null }> | undefined,
  ) => void;
}) {
  // Restored from storage on mount, so an unmount does not orphan a crawl the
  // user already paid for. See reviewsTaskStore for why this is persisted
  // rather than held by a parent.
  const [task, setTask] = useState<StoredReviewsTask | null>(() =>
    loadReviewsTask(projectId, keyword),
  );
  const taskId = task?.taskId ?? null;

  const startMutation = useMutation({
    mutationFn: () => startBusinessReviews({ data: { projectId, keyword } }),
    onSuccess: (result) => {
      const started: StoredReviewsTask = {
        taskId: result.taskId,
        startedAt: Date.now(),
      };
      setTask(started);
      saveReviewsTask(projectId, keyword, started);
    },
  });

  const resultQuery = useQuery({
    enabled: taskId != null,
    queryKey: ["business-reviews", projectId, taskId],
    queryFn: () =>
      getBusinessReviewsResult({ data: { projectId, taskId: taskId ?? "" } }),
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 5_000 : false,
  });

  const outcome = resultQuery.data;

  // A failed task's id is worth nothing on a later visit, so it does not earn a
  // place in storage. A completed one stays: reading it back is a free
  // `task_get`, which is how returning to this page shows the reviews again
  // instead of offering to buy them a second time.
  useEffect(() => {
    if (outcome?.status === "failed") clearReviewsTask(projectId, keyword);
  }, [outcome?.status, projectId, keyword]);

  // Past the stall cutoff we stop treating a pending task as live. Without this
  // a crawl that never finishes leaves the button stuck on "Crawling reviews…"
  // with no way to start another.
  const stalled =
    task != null &&
    (!outcome || outcome.status === "pending") &&
    Date.now() - task.startedAt > REVIEWS_STALL_AFTER_MS;
  const loadedReviews =
    outcome?.status === "completed" ? outcome.items : undefined;

  // Reports already-fetched data upward -- never triggers a fetch of its
  // own. `loadedReviews` only changes reference when react-query hands back
  // genuinely new data, so this can't loop: re-reporting the same reviews
  // array is a same-reference no-op React bails out of.
  useEffect(() => {
    onReviewsLoaded?.(loadedReviews);
  }, [loadedReviews, onReviewsLoaded]);

  const isWorking =
    startMutation.isPending ||
    (taskId != null && !stalled && (!outcome || outcome.status === "pending"));
  const errorMessage = startMutation.isError
    ? getStandardErrorMessage(startMutation.error)
    : resultQuery.isError
      ? getStandardErrorMessage(resultQuery.error)
      : outcome?.status === "failed"
        ? outcome.message
        : stalled
          ? "The last reviews crawl never finished. Fetching again will start a new one."
          : null;

  return (
    <>
      {outcome?.status === "completed" && outcome.items.length > 0 ? (
        <ReviewAnalyticsCards reviews={outcome.items} />
      ) : null}

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Latest reviews</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setTask(null);
                clearReviewsTask(projectId, keyword);
                startMutation.mutate();
              }}
              disabled={isWorking}
            >
              {isWorking ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Crawling reviews…
                </>
              ) : (
                meteredActionLabel("Fetch reviews", {
                  kind: "paidRequests",
                  count: 1,
                })
              )}
            </Button>
          </div>

          {errorMessage ? (
            <Banner variant="error" className="text-sm">
              {errorMessage}
            </Banner>
          ) : null}

          {outcome?.status === "completed" ? (
            outcome.items.length === 0 ? (
              <p className="text-sm text-base-content/60">
                The crawl finished but returned no reviews.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {outcome.items.map((review, index) => (
                  <li
                    key={review.reviewId ?? String(index)}
                    className="rounded-lg border border-base-300 p-3"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Star className="size-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-medium">
                        {review.rating ?? "—"}
                      </span>
                      <span className="text-base-content/60">
                        {review.author ?? "Anonymous"}
                      </span>
                      <span className="text-xs text-base-content/40">
                        {review.timeAgo ?? ""}
                      </span>
                    </div>
                    {review.text ? (
                      <p className="pt-1 text-sm text-base-content/80">
                        {review.text}
                      </p>
                    ) : null}
                    {review.ownerAnswer ? (
                      <p className="mt-2 rounded bg-base-200 p-2 text-xs text-base-content/70">
                        Owner reply: {review.ownerAnswer}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : taskId == null ? (
            <p className="text-sm text-base-content/60">
              Fetch the newest reviews to check sentiment and response coverage.
              Reviews are crawled on demand and usually take under a minute.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
