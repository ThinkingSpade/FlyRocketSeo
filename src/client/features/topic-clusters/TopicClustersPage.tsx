import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Network, NotebookPen, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getTopicClusters } from "@/serverFunctions/topic-clusters";
import {
  clusterPlanToMarkdown,
  computeClusterPlanTotals,
  prioritizeClusters,
  type ClusterPriority,
} from "@/client/features/topic-clusters/clusterPriorities";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";

type ClustersNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

function formatVolume(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString();
}

export function TopicClustersPage({
  projectId,
  navigate,
  query,
  locationCode,
}: {
  projectId: string;
  navigate: ClustersNavigate;
  query: string;
  locationCode: number | undefined;
}) {
  const activeLocation = locationCode ?? DEFAULT_LOCATION_CODE;
  const [input, setInput] = useState(query);
  const [locationInput, setLocationInput] = useState(String(activeLocation));
  const topic = query.trim();

  const clustersQuery = useQuery({
    enabled: topic.length > 0,
    queryKey: ["topic-clusters", projectId, topic, activeLocation],
    queryFn: () =>
      getTopicClusters({
        data: { projectId, topic, locationCode: activeLocation },
      }),
    staleTime: 30 * 60_000,
  });
  const plan = clustersQuery.data;
  const errorMessage = clustersQuery.isError
    ? getStandardErrorMessage(clustersQuery.error)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Network className="size-5" />
          Topic Clusters
        </h1>
        <p className="text-sm text-base-content/60">
          Turn one topic into a hub-and-spoke content plan: the hub page&rsquo;s
          keyword set plus the subtopic clusters worth their own articles — each
          one a click away from a full content brief.
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
                search: (prev) => ({
                  ...prev,
                  q: next,
                  loc: Number(locationInput),
                }),
                replace: false,
              });
            }}
          >
            <label className="form-control w-full sm:max-w-md">
              <span className="label-text pb-1 text-xs font-medium">
                Seed topic
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="office vending machines"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <label className="form-control w-full sm:max-w-56">
              <span className="label-text pb-1 text-xs font-medium">
                Location
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={locationInput}
                onChange={(event) => setLocationInput(event.target.value)}
              >
                {LOCATION_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!input.trim() || clustersQuery.isFetching}
            >
              {clustersQuery.isFetching ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Search className="size-3.5" />
              )}
              Plan clusters
            </button>
          </form>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-error text-sm">{errorMessage}</div>
      ) : null}

      {!topic ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-12 text-center">
            <p className="font-medium">Enter a topic to plan a cluster</p>
            <p className="max-w-md text-sm text-base-content/60">
              Hub-and-spoke content is how sites own a topic: one pillar page
              plus focused articles interlinked around it.
            </p>
          </div>
        </div>
      ) : null}

      {topic && clustersQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : null}

      {plan ? <ClusterPlan plan={plan} projectId={projectId} /> : null}
    </div>
  );
}

const PRIORITY_BADGES: Record<ClusterPriority, string> = {
  1: "badge-success",
  2: "badge-warning",
  3: "badge-ghost",
};

function ClusterPlan({
  plan,
  projectId,
}: {
  plan: NonNullable<Awaited<ReturnType<typeof getTopicClusters>>>;
  projectId: string;
}) {
  // Priority ranking + totals are pure client-side cuts of the fetched plan.
  const clusters = useMemo(() => prioritizeClusters(plan.clusters), [plan]);
  const totals = useMemo(() => computeClusterPlanTotals(plan.clusters), [plan]);

  const handleCopyPlan = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard is unavailable in this browser");
      return;
    }
    try {
      await navigator.clipboard.writeText(
        clusterPlanToMarkdown({ topic: plan.topic, hub: plan.hub, clusters }),
      );
    } catch {
      toast.error("Couldn't copy to clipboard");
      return;
    }
    toast.success("Copied the cluster plan as Markdown");
    captureClientEvent("data:export", {
      source_feature: "topic_clusters",
      result_count: clusters.length,
      scope: "all",
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-ghost tabular-nums">
          {totals.clusterCount} clusters
        </span>
        <span className="badge badge-ghost tabular-nums">
          {totals.keywordCount} keywords
        </span>
        <span className="badge badge-ghost tabular-nums">
          {totals.totalVolume.toLocaleString()} total vol
        </span>
        {totals.averageDifficulty != null ? (
          <span className="badge badge-ghost tabular-nums">
            avg KD {totals.averageDifficulty}
          </span>
        ) : null}
        <div className="flex-1" />
        <button className="btn btn-soft btn-xs gap-1" onClick={handleCopyPlan}>
          <Sparkles className="size-3" /> Copy plan for AI
        </button>
      </div>

      <ClusterPlanBody plan={plan} clusters={clusters} projectId={projectId} />
    </>
  );
}

function ClusterPlanBody({
  plan,
  clusters,
  projectId,
}: {
  plan: NonNullable<Awaited<ReturnType<typeof getTopicClusters>>>;
  clusters: ReturnType<typeof prioritizeClusters>;
  projectId: string;
}) {
  return (
    <>
      {plan.hub.length > 0 ? (
        <div className="card border border-primary/40 bg-base-100">
          <div className="card-body gap-2 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">
                Hub page — &ldquo;{plan.topic}&rdquo;
              </h2>
              <Link
                to="/p/$projectId/content"
                params={{ projectId }}
                search={{ q: plan.topic, loc: plan.locationCode }}
                className="btn btn-primary btn-xs gap-1"
              >
                <NotebookPen className="size-3" /> Build brief
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {plan.hub.map((keyword) => (
                <span key={keyword.keyword} className="badge badge-ghost">
                  {keyword.keyword}
                  <span className="ml-1 text-base-content/50 tabular-nums">
                    {formatVolume(keyword.searchVolume)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {clusters.map((cluster) => {
          const topKeyword = cluster.keywords[0]?.keyword ?? plan.topic;
          return (
            <div
              key={cluster.name}
              className="card border border-base-300 bg-base-100"
            >
              <div className="card-body gap-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-semibold">
                    <span
                      className={`badge badge-sm ${PRIORITY_BADGES[cluster.priority]}`}
                      title="Priority from volume weighed against difficulty — write P1 clusters first"
                    >
                      P{cluster.priority}
                    </span>
                    {cluster.name}
                  </h3>
                  <span className="text-xs text-base-content/50 tabular-nums">
                    {cluster.totalVolume.toLocaleString()} vol ·{" "}
                    {cluster.keywords.length} keywords
                    {cluster.averageDifficulty != null
                      ? ` · KD ${Math.round(cluster.averageDifficulty)}`
                      : ""}
                  </span>
                </div>
                <ul className="space-y-0.5 text-sm text-base-content/80">
                  {cluster.keywords.map((keyword) => (
                    <li
                      key={keyword.keyword}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="line-clamp-1">{keyword.keyword}</span>
                      <span className="shrink-0 text-xs text-base-content/50 tabular-nums">
                        {formatVolume(keyword.searchVolume)}
                        {keyword.keywordDifficulty != null
                          ? ` · KD ${keyword.keywordDifficulty}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex gap-2">
                  <Link
                    to="/p/$projectId/content"
                    params={{ projectId }}
                    search={{ q: topKeyword, loc: plan.locationCode }}
                    className="btn btn-soft btn-xs gap-1"
                  >
                    <NotebookPen className="size-3" /> Build brief
                  </Link>
                  <Link
                    to="/p/$projectId/serp"
                    params={{ projectId }}
                    search={{ q: topKeyword, loc: plan.locationCode }}
                    className="btn btn-ghost btn-xs"
                  >
                    View SERP
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-base-content/40">
        Plan for &ldquo;{plan.topic}&rdquo; · fetched{" "}
        {new Date(plan.fetchedAt).toLocaleString()}
      </p>
    </>
  );
}
