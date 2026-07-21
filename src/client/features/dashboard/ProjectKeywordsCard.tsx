import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { KeyRound, Target, TrendingUp } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  CardEmpty,
  CardError,
  CardTilesSkeleton,
  DashboardCard,
  formatCount,
  useProjectNavLinks,
} from "./dashboardShared";
import {
  selectOpportunities,
  selectRankingNow,
  summarizeProjectKeywords,
  type RankedQuery,
} from "./projectKeywords";

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">
        {formatCount(value)}
      </div>
    </div>
  );
}

function QueryList({
  title,
  hint,
  icon,
  rows,
  emptyLabel,
  metric,
}: {
  title: string;
  hint: string;
  icon: typeof KeyRound;
  rows: RankedQuery[];
  emptyLabel: string;
  metric: "clicks" | "impressions";
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <InsightIcon icon={icon} />
        {title}
      </h3>
      <p className="mt-0.5 text-xs text-base-content/50">{hint}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-base-content/50">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((row) => (
            <li
              key={row.query}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate" title={row.query}>
                {row.query}
              </span>
              <span className="shrink-0 text-xs text-base-content/60 tabular-nums">
                #{Math.round(row.position)}
                <span className="text-base-content/40">
                  {" · "}
                  {formatCount(
                    metric === "clicks" ? row.clicks : row.impressions,
                  )}{" "}
                  {metric === "clicks" ? "clicks" : "impr."}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * "Keywords you rank for / could be targeting" — the project-centric view,
 * built entirely from the free first-party GSC report the dashboard already
 * loads. No extra API call, so it can populate on arrival.
 */
export function ProjectKeywordsCard({ projectId }: { projectId: string }) {
  const nav = useProjectNavLinks(projectId);
  const gscLink = nav.get("/p/$projectId/search-performance").linkProps;

  // Same key as SearchPerformanceCard: one fetch serves both cards.
  const reportQuery = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
  });
  const report = reportQuery.data;

  if (reportQuery.isError) {
    return (
      <DashboardCard icon={KeyRound} title="Your keywords">
        <CardError error={reportQuery.error} />
      </DashboardCard>
    );
  }
  if (reportQuery.isPending) {
    return (
      <DashboardCard icon={KeyRound} title="Your keywords">
        <CardTilesSkeleton />
      </DashboardCard>
    );
  }
  // Not connected is already covered by the search-performance card above.
  if (!report?.connected) return null;

  const queries = report.queryTotals;
  const summary = summarizeProjectKeywords(queries);
  const rankingNow = selectRankingNow(queries);
  const opportunities = selectOpportunities(queries);

  if (summary.ranking === 0) {
    return (
      <DashboardCard
        icon={KeyRound}
        title="Your keywords · last 28 days"
        headerLink={gscLink}
      >
        <CardEmpty>
          <p>
            No search queries yet in this period — once Google shows your pages,
            the keywords you rank for land here.
          </p>
        </CardEmpty>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      icon={KeyRound}
      title="Your keywords · last 28 days"
      headerLink={gscLink}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Ranking queries" value={summary.ranking} />
        <Tile label="Top 3" value={summary.top3} />
        <Tile label="Top 10" value={summary.top10} />
        <Tile label="Close to page 1" value={summary.closeToPageOne} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <QueryList
          title="Ranking now"
          hint="What's already earning — best position, clicks, impressions."
          icon={TrendingUp}
          rows={rankingNow}
          metric="clicks"
          emptyLabel="No clicked queries in this period yet."
        />
        <QueryList
          title="Could be targeting"
          hint="Positions 4–20 with real demand — the closest wins."
          icon={Target}
          rows={opportunities}
          metric="impressions"
          emptyLabel="No near-miss queries — everything is already top 3 or far off."
        />
      </div>

      <Link {...gscLink} className="btn btn-ghost btn-sm mt-3">
        See all queries
      </Link>
    </DashboardCard>
  );
}
