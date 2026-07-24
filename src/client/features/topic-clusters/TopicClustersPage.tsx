import { useMemo, useState } from "react";
import { Network, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getTopicClusters } from "@/serverFunctions/topic-clusters";
import { topicClusterPlanSchema } from "@/types/schemas/topic-clusters";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import {
  clusterPlanToMarkdown,
  computeClusterPlanTotals,
  prioritizeClusters,
} from "@/client/features/topic-clusters/clusterPriorities";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import {
  CoverageSummary,
  useTopicPlanCoverage,
} from "@/client/features/topic-clusters/TopicCoverageOverlay";
import { ClusterPlanBody } from "@/client/features/topic-clusters/ClusterPlanBody";

type ClustersNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

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
  const [runInput, setRunInput] = useState<{
    topic: string;
    locationCode: number;
  } | null>(null);
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, input.trim(), Number(locationInput)),
  );

  const clustersQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: runInput != null,
    queryKey: ["topic-clusters", projectId, runInput],
    queryFn: () =>
      getTopicClusters({
        data: {
          projectId,
          topic: runInput?.topic ?? "",
          locationCode: runInput?.locationCode ?? activeLocation,
        },
      }),
  });
  // Restoring the project's last plan is free: it reads a stored row plus the
  // R2 object that run already paid for, never a metered fetch.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.topicClusters,
    schema: topicClusterPlanSchema,
    enabled: runInput == null,
    runId: selectedRunId,
  });
  const plan = clustersQuery.data ?? restored?.result;
  const restoredRun = clustersQuery.data == null ? restored : null;
  const errorMessage = clustersQuery.isError
    ? getStandardErrorMessage(clustersQuery.error)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 p-4">
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
              setRunInput({
                topic: next,
                locationCode: Number(locationInput),
              });
              run.authorize();
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

      {runInput == null ? (
        <RecentRunsList
          projectId={projectId}
          feature={RUN_FEATURES.topicClusters}
          activeRunId={selectedRunId}
          onSelect={setSelectedRunId}
        />
      ) : null}

      {restoredRun ? (
        <RestoredRunBanner
          label={restoredRun.label}
          lastRanAt={restoredRun.lastRanAt}
          runCount={restoredRun.runCount}
          onRunAgain={() => {
            setInput(restoredRun.result.topic);
            setLocationInput(String(restoredRun.result.locationCode));
            setRunInput({
              topic: restoredRun.result.topic,
              locationCode: restoredRun.result.locationCode,
            });
            run.authorize(
              createMeteredRunKey(
                projectId,
                restoredRun.result.topic,
                restoredRun.result.locationCode,
              ),
            );
            navigate({
              search: (prev) => ({
                ...prev,
                q: restoredRun.result.topic,
                loc: restoredRun.result.locationCode,
              }),
              replace: false,
            });
          }}
        />
      ) : null}

      {runInput == null && !restoredRun ? (
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

      {runInput != null && clustersQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : null}

      {plan ? <ClusterPlan plan={plan} projectId={projectId} /> : null}
    </div>
  );
}

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
  const coverageState = useTopicPlanCoverage({
    projectId,
    hubTerms: [plan.topic, ...plan.hub.map((keyword) => keyword.keyword)],
    clusters: clusters.map((cluster) => ({
      name: cluster.name,
      terms: cluster.keywords.map((keyword) => keyword.keyword),
    })),
  });

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
      <CoverageSummary
        coverage={coverageState.coverage}
        isLoading={coverageState.isLoading}
        isConnected={coverageState.isConnected}
      />

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

      <ClusterPlanBody
        plan={plan}
        clusters={clusters}
        projectId={projectId}
        coverage={coverageState.coverage}
      />
    </>
  );
}
