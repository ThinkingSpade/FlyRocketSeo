import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import {
  getLatestRankResults,
  getRankTrackingConfigSummaries,
} from "@/serverFunctions/rank-tracking";
import { computeScorecards } from "@/client/features/rank-tracking/rankTrackingScorecards";
import { StatCard } from "@/client/features/audit/shared";
import {
  CardEmpty,
  CardError,
  CardTilesSkeleton,
  countDelta,
  DashboardCard,
  DeltaStatTile,
  pointsDelta,
  useProjectNavLinks,
} from "./dashboardShared";

export function RankTrackingCard({ projectId }: { projectId: string }) {
  const nav = useProjectNavLinks(projectId);
  const rankLink = nav.get("/p/$projectId/rank-tracking").linkProps;

  const summariesQuery = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
  });

  const summaries = useMemo(
    () => summariesQuery.data ?? [],
    [summariesQuery.data],
  );
  // Primary = the config with the most keywords (the richest scorecard); ties
  // keep the first, which is the earliest created.
  const primary = useMemo(() => {
    if (summaries.length === 0) return null;
    return summaries.reduce(
      (best, current) =>
        current.keywordCount > best.keywordCount ? current : best,
      summaries[0],
    );
  }, [summaries]);

  const resultsQuery = useQuery({
    queryKey: ["rankTrackingResults", projectId, primary?.id ?? null],
    queryFn: () =>
      getLatestRankResults({ data: { projectId, configId: primary!.id } }),
    enabled: primary !== null,
  });

  const scorecards = useMemo(
    () =>
      resultsQuery.data
        ? computeScorecards(resultsQuery.data.rows, "desktop")
        : null,
    [resultsQuery.data],
  );

  return (
    <DashboardCard
      icon={TrendingUp}
      title="Rank tracking"
      headerLink={rankLink}
    >
      {summariesQuery.isError ? (
        <CardError error={summariesQuery.error} />
      ) : summariesQuery.isPending ? (
        <CardTilesSkeleton />
      ) : summaries.length === 0 || primary === null ? (
        <CardEmpty>
          <p>No tracked domains yet.</p>
          <Link {...rankLink} className="btn btn-primary btn-sm mt-3">
            Start tracking rankings
          </Link>
        </CardEmpty>
      ) : (
        <>
          <p className="text-xs text-base-content/60">
            <span className="font-medium text-base-content/80">
              {primary.domain}
            </span>{" "}
            · Desktop · {primary.keywordCount}{" "}
            {primary.keywordCount === 1 ? "keyword" : "keywords"}
            {primary.lastRunCompletedAt ? (
              <>
                {" "}
                · Last checked{" "}
                {new Date(primary.lastRunCompletedAt).toLocaleDateString()}
              </>
            ) : null}
          </p>

          {resultsQuery.isError ? (
            <CardError error={resultsQuery.error} />
          ) : resultsQuery.isPending || scorecards === null ? (
            <CardTilesSkeleton />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <DeltaStatTile
                  label="Visibility"
                  value={
                    scorecards.visibility === null
                      ? "—"
                      : `${scorecards.visibility.toFixed(1)}%`
                  }
                  delta={pointsDelta(scorecards.visibilityDelta)}
                />
                <DeltaStatTile
                  label="Ranking keywords"
                  value={String(scorecards.ranking)}
                  delta={countDelta(scorecards.rankingDelta)}
                />
                <StatCard label="Top 3" value={String(scorecards.top3)} />
                <StatCard label="Top 10" value={String(scorecards.top10)} />
              </div>
              <p className="text-xs text-base-content/60">
                <span className="text-success">
                  {scorecards.improved} improved
                </span>{" "}
                ·{" "}
                <span className="text-error">
                  {scorecards.declined} declined
                </span>{" "}
                since the previous check
              </p>
            </>
          )}
        </>
      )}
    </DashboardCard>
  );
}
