import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MapPin, Search, Star } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getBusinessProfile,
  getBusinessReviewsResult,
  startBusinessReviews,
} from "@/serverFunctions/local-seo";
import { ReviewAnalyticsCards } from "./ReviewAnalyticsCards";

type LocalSeoNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

export function LocalSeoPage({
  projectId,
  navigate,
  query,
}: {
  projectId: string;
  navigate: LocalSeoNavigate;
  query: string;
}) {
  const [input, setInput] = useState(query);
  const keyword = query.trim();

  const profileQuery = useQuery({
    enabled: keyword !== "",
    queryKey: ["business-profile", projectId, keyword],
    queryFn: () => getBusinessProfile({ data: { projectId, keyword } }),
    staleTime: 5 * 60_000,
  });

  const errorMessage = profileQuery.isError
    ? getStandardErrorMessage(profileQuery.error)
    : null;
  const profile = profileQuery.data;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <MapPin className="size-5" />
          Local SEO
        </h1>
        <p className="text-sm text-base-content/60">
          Look up a Google Business Profile and its latest reviews — ratings,
          categories, and claimed status at a glance.
        </p>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const next = input.trim();
              if (!next) return;
              navigate({
                search: (prev) => ({ ...prev, q: next }),
                replace: false,
              });
            }}
          >
            <label className="form-control w-full sm:max-w-xl">
              <span className="label-text pb-1 text-xs font-medium">
                Business name (add a city for precision)
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="Joe's Pizza Brooklyn"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!input.trim() || profileQuery.isFetching}
            >
              {profileQuery.isFetching ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Search className="size-3.5" />
              )}
              Look up
            </button>
          </form>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-error text-sm">{errorMessage}</div>
      ) : null}

      {keyword === "" ? (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body items-center py-12 text-sm text-base-content/60">
            Enter a business name above to load its Google Business Profile.
          </div>
        </div>
      ) : profile ? (
        !profile.found ? (
          <div className="card border border-base-300 bg-base-100">
            <div className="card-body items-center py-12 text-sm text-base-content/60">
              No Google Business Profile found for &ldquo;{keyword}&rdquo;. Try
              adding the city or checking the spelling.
            </div>
          </div>
        ) : (
          <>
            <ProfileCard profile={profile} />
            <ReviewsSection projectId={projectId} keyword={keyword} />
          </>
        )
      ) : null}
    </div>
  );
}

type ProfileData = NonNullable<Awaited<ReturnType<typeof getBusinessProfile>>>;

function ProfileCard({ profile }: { profile: ProfileData }) {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3 p-4">
        <div className="flex items-start gap-3">
          {profile.logo ? (
            <img
              src={profile.logo}
              alt=""
              className="size-12 rounded-lg object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{profile.title}</h2>
            <p className="text-sm text-base-content/60">
              {[profile.category, ...profile.additionalCategories]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Star className="size-4 fill-amber-400 text-amber-400" />
            <span className="font-semibold">{profile.rating ?? "—"}</span>
            <span className="text-base-content/50">
              ({profile.reviewsCount?.toLocaleString() ?? "—"})
            </span>
          </div>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <ProfileField label="Address" value={profile.address} />
          <ProfileField label="Phone" value={profile.phone} />
          <ProfileField label="Website" value={profile.url} isLink />
          <ProfileField
            label="Claimed"
            value={
              profile.isClaimed == null
                ? null
                : profile.isClaimed
                  ? "Yes"
                  : "No — claim it to manage this profile"
            }
          />
        </div>

        {profile.description ? (
          <p className="text-sm text-base-content/70">{profile.description}</p>
        ) : null}
      </div>
    </div>
  );
}

function ProfileField({
  label,
  value,
  isLink = false,
}: {
  label: string;
  value: string | null;
  isLink?: boolean;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-base-content/50">
        {label}
      </span>
      {value == null ? (
        <span className="text-base-content/40">—</span>
      ) : isLink ? (
        <a
          className="link link-hover break-all"
          href={value}
          target="_blank"
          rel="noopener noreferrer"
        >
          {value}
        </a>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}

function ReviewsSection({
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
    // Reviews are crawled asynchronously; poll until the task completes.
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
