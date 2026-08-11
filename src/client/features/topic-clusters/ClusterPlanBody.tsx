import { Link } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";
import type { getTopicClusters } from "@/serverFunctions/topic-clusters";
import type {
  prioritizeClusters,
  ClusterPriority,
} from "@/client/features/topic-clusters/clusterPriorities";
import {
  CoverageTag,
  type PlanCoverage,
} from "@/client/features/topic-clusters/TopicCoverageOverlay";
import type { ComponentProps } from "react";
import { Badge } from "@cloudflare/kumo/components/badge";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";
import { summariseClusterFit } from "./clusterFit";

const PRIORITY_BADGES: Record<
  ClusterPriority,
  ComponentProps<typeof Badge>["variant"]
> = {
  1: "success",
  2: "warning",
  3: "neutral",
};

function formatVolume(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString();
}

export function ClusterPlanBody({
  plan,
  clusters,
  projectId,
  coverage,
  fit,
  geoSuffix,
}: {
  plan: NonNullable<Awaited<ReturnType<typeof getTopicClusters>>>;
  clusters: ReturnType<typeof prioritizeClusters>;
  projectId: string;
  coverage: PlanCoverage | null;
  /**
   * Fit verdicts for every keyword in this plan, keyed by keyword.
   *
   * Empty whenever the project's profile is missing, unusable or still an
   * unconfirmed AI draft — which the rendering below must treat as "not
   * checked", never as "checked and all fine".
   */
  fit: ReadonlyMap<string, FitResult>;
  /** Defect 2 fix: the muted "US" (no "·") qualifier for this plan's
   *  volume/KD figures -- see ClusterPlan.tsx's own `geoSuffix` for why
   *  it's safe to derive directly from `plan.locationCode` here. Empty
   *  string when there's nothing truthful to append (see
   *  `geoMetricSuffix`'s own doc comment). */
  geoSuffix: string;
}) {
  return (
    <>
      {plan.hub.length > 0 ? (
        <div className="relative flex flex-col rounded-xl border border-primary/40 bg-base-100">
          <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">
                  Hub page — &ldquo;{plan.topic}&rdquo;
                </h2>
                {coverage ? (
                  <div className="mt-1">
                    <CoverageTag coverage={coverage.hub} />
                  </div>
                ) : null}
              </div>
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
                <Badge key={keyword.keyword} variant="neutral">
                  {keyword.keyword}
                  <span className="ml-1 text-base-content/50 tabular-nums">
                    {formatVolume(keyword.searchVolume)}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {clusters.map((cluster) => {
          const topKeyword = cluster.keywords[0]?.keyword ?? plan.topic;
          const clusterCoverage = coverage?.clusters.get(cluster.name);
          const clusterFit = summariseClusterFit(
            cluster.keywords.map((keyword) => keyword.keyword),
            fit,
          );
          return (
            <div
              key={cluster.name}
              className="relative flex flex-col rounded-xl border border-base-300 bg-base-100"
            >
              <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-semibold">
                    <span title="Priority from volume weighed against difficulty — write P1 clusters first">
                      <Badge variant={PRIORITY_BADGES[cluster.priority]}>
                        P{cluster.priority}
                      </Badge>
                    </span>
                    {cluster.name}
                  </h3>
                  <span className="text-xs text-base-content/50 tabular-nums">
                    {cluster.totalVolume.toLocaleString()} vol
                    {geoSuffix ? ` (${geoSuffix})` : ""} ·{" "}
                    {cluster.keywords.length} keywords
                    {cluster.averageDifficulty != null
                      ? ` · KD ${Math.round(cluster.averageDifficulty)}${geoSuffix ? ` (${geoSuffix})` : ""}`
                      : ""}
                  </span>
                </div>
                {clusterCoverage ? (
                  <div>
                    <CoverageTag coverage={clusterCoverage} />
                  </div>
                ) : null}
                {clusterFit.wrongCustomer > 0 ? (
                  <p className="text-xs text-warning">
                    {clusterFit.wrongCustomer} of {clusterFit.total} aren&apos;t
                    this client&apos;s customer — worth cutting before you
                    brief.
                  </p>
                ) : null}
                <ul className="space-y-0.5 text-sm text-base-content/80">
                  {cluster.keywords.map((keyword) => {
                    // Dimmed, not removed. The verdict comes from rules the
                    // user wrote and can be wrong, so this has to stay a
                    // recommendation they can overrule by looking at it —
                    // silently dropping rows would hide the disagreement.
                    const isWrong =
                      fit.get(keyword.keyword)?.verdict === "wrong-customer";
                    return (
                      <li
                        key={keyword.keyword}
                        className={`flex items-baseline justify-between gap-2${
                          isWrong ? " text-base-content/40" : ""
                        }`}
                        title={
                          isWrong
                            ? (fit.get(keyword.keyword)?.reason ?? undefined)
                            : undefined
                        }
                      >
                        <span className="line-clamp-1">{keyword.keyword}</span>
                        <span className="shrink-0 text-xs text-base-content/50 tabular-nums">
                          {formatVolume(keyword.searchVolume)}
                          {keyword.keywordDifficulty != null
                            ? ` · KD ${keyword.keywordDifficulty}`
                            : ""}
                        </span>
                      </li>
                    );
                  })}
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
