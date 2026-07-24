import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getBusinessReviewsResult,
  startBusinessReviews,
} from "@/serverFunctions/local-seo";
import { ReviewAnalyticsCards } from "./ReviewAnalyticsCards";

export function LocalReviewsSection({
  projectId,
  keyword,
}: {
  projectId: string;
  keyword: string;
}) {
  const [taskId, setTaskId] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: () => startBusinessReviews({ data: { projectId, keyword } }),
    onSuccess: (result) => setTaskId(result.taskId),
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
  const isWorking =
    startMutation.isPending ||
    (taskId != null && (!outcome || outcome.status === "pending"));
  const errorMessage = startMutation.isError
    ? getStandardErrorMessage(startMutation.error)
    : resultQuery.isError
      ? getStandardErrorMessage(resultQuery.error)
      : outcome?.status === "failed"
        ? outcome.message
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
            <button
              type="button"
              className="btn btn-sm btn-outline gap-1.5"
              onClick={() => {
                setTaskId(null);
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
                "Fetch reviews"
              )}
            </button>
          </div>

          {errorMessage ? (
            <div className="alert alert-error text-sm">{errorMessage}</div>
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
