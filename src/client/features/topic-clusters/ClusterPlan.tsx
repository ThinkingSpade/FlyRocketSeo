import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { getTopicClusters } from "@/serverFunctions/topic-clusters";
import {
  clusterPlanToMarkdown,
  computeClusterPlanTotals,
  prioritizeClusters,
} from "@/client/features/topic-clusters/clusterPriorities";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  CoverageSummary,
  useTopicPlanCoverage,
} from "@/client/features/topic-clusters/TopicCoverageOverlay";
import { ClusterPlanBody } from "@/client/features/topic-clusters/ClusterPlanBody";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import { buildClustersVerdict } from "@/client/features/insights/verdicts/content";

/**
 * The fetched plan's own view: priority-ranked clusters, coverage against the
 * project's tracked pages, the verdict, and the full cluster body. Pulled out
 * of TopicClustersPage (the search form + run state) so that file stays under
 * the line cap -- this half depends only on an already-resolved `plan`, never
 * on the form state above it.
 */
export function ClusterPlan({
  plan,
  projectId,
}: {
  plan: NonNullable<Awaited<ReturnType<typeof getTopicClusters>>>;
  projectId: string;
}) {
  // Priority ranking + totals are pure client-side cuts of the fetched plan.
  const clusters = useMemo(() => prioritizeClusters(plan.clusters), [plan]);
  const totals = useMemo(() => computeClusterPlanTotals(plan.clusters), [plan]);
  // clusters is already sorted by opportunity (prioritizeClusters' own
  // order), so the verdict's lead candidate is always the plan's own P1
  // cluster -- it can never name a different "worth a hub" pick than the
  // priority badges below already show.
  const clustersVerdict = useMemo(
    () =>
      buildClustersVerdict({
        topic: plan.topic,
        clusters: clusters.map((cluster) => ({
          name: cluster.name,
          keywordCount: cluster.keywords.length,
          totalVolume: cluster.totalVolume,
          averageDifficulty: cluster.averageDifficulty,
        })),
      }),
    [plan.topic, clusters],
  );
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

      <NextStepsCard
        verdict={clustersVerdict}
        projectId={projectId}
        tab="Topic Clusters"
      />

      <ClusterPlanBody
        plan={plan}
        clusters={clusters}
        projectId={projectId}
        coverage={coverageState.coverage}
      />
    </>
  );
}
