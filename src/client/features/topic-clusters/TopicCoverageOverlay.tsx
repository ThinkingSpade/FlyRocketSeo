import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  getTopicCoverage,
  isProjectGscReport,
  type TopicCoverage,
} from "@/client/features/search-performance/projectGscInsights";

export type PlanCoverage = {
  hub: TopicCoverage;
  clusters: Map<string, TopicCoverage>;
};

const COVERAGE_LABELS = {
  covered: "Covered",
  missing: "Missing",
  cannibalized: "Cannibalized",
} as const;

const COVERAGE_BADGES = {
  covered: "badge-success",
  missing: "badge-ghost",
  cannibalized: "badge-warning",
} as const;

export function useTopicPlanCoverage({
  projectId,
  hubTerms,
  clusters,
}: {
  projectId: string;
  hubTerms: string[];
  clusters: Array<{ name: string; terms: string[] }>;
}) {
  const gscQuery = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    staleTime: 5 * 60_000,
  });
  const gscData = gscQuery.data;
  const report = isProjectGscReport(gscData) ? gscData : null;
  const coverage = useMemo<PlanCoverage | null>(
    () =>
      report
        ? {
            hub: getTopicCoverage(report, hubTerms),
            clusters: new Map(
              clusters.map((cluster) => [
                cluster.name,
                getTopicCoverage(report, cluster.terms),
              ]),
            ),
          }
        : null,
    [clusters, hubTerms, report],
  );
  return {
    coverage,
    isLoading: gscQuery.isPending,
    isConnected: gscData?.connected !== false,
  };
}

export function CoverageTag({ coverage }: { coverage: TopicCoverage }) {
  return (
    <span
      className={`badge badge-sm ${COVERAGE_BADGES[coverage.status]}`}
      title={
        coverage.pages.length > 0
          ? coverage.pages.join("\n")
          : // Coverage is matched against a clicks-ordered, capped pull, so a
            // "missing" topic may simply rank below where the pull stopped.
            "No matching landing page among the Search Console rows retrieved for the last 28 days"
      }
    >
      {COVERAGE_LABELS[coverage.status]} · {coverage.pageCount}{" "}
      {coverage.pageCount === 1 ? "page" : "pages"}
    </span>
  );
}

export function CoverageSummary({
  coverage,
  isLoading,
  isConnected,
}: {
  coverage: PlanCoverage | null;
  isLoading: boolean;
  isConnected: boolean;
}) {
  const items = coverage ? [coverage.hub, ...coverage.clusters.values()] : [];
  const counts = {
    covered: items.filter((item) => item.status === "covered").length,
    missing: items.filter((item) => item.status === "missing").length,
    cannibalized: items.filter((item) => item.status === "cannibalized").length,
  };
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Search coverage</h2>
        <span className="text-xs text-base-content/50">
          Free GSC · last 28 days
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["covered", "missing", "cannibalized"] as const).map((status) => (
          <div
            key={status}
            className="rounded-lg border border-base-300 bg-base-100 px-3 py-2"
          >
            <p className="text-xs text-base-content/55">
              {COVERAGE_LABELS[status]}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {coverage ? counts[status] : "—"}
            </p>
          </div>
        ))}
      </div>
      {!coverage && !isLoading ? (
        <p className="mt-1.5 text-xs text-base-content/50">
          {isConnected
            ? "Search Console coverage is temporarily unavailable."
            : "Connect Search Console to map this roadmap to ranking pages."}
        </p>
      ) : null}
    </div>
  );
}
