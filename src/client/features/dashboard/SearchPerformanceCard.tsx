import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GoogleGlyphMuted } from "@/client/features/gsc/GoogleGlyph";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  CardEmpty,
  CardError,
  CardTilesSkeleton,
  DashboardCard,
  DeltaStatTile,
  formatCount,
  formatCtr,
  formatPosition,
  percentDelta,
  positionDelta,
  useProjectNavLinks,
} from "./dashboardShared";

export function SearchPerformanceCard({ projectId }: { projectId: string }) {
  const nav = useProjectNavLinks(projectId);
  const searchPerformanceLink = nav.get(
    "/p/$projectId/search-performance",
  ).linkProps;

  // First-party GSC data, free — safe to auto-load. Distinct key length keeps
  // this off the full page's [key, range, device, country] cache slot.
  const reportQuery = useQuery({
    queryKey: ["searchPerformance", projectId, "overview", "last_28_days"],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
  });
  const report = reportQuery.data;

  return (
    <DashboardCard
      icon={GoogleGlyphMuted}
      title="Search performance · last 28 days"
      headerLink={searchPerformanceLink}
    >
      {reportQuery.isError ? (
        <CardError error={reportQuery.error} />
      ) : reportQuery.isPending ? (
        <CardTilesSkeleton />
      ) : !report?.connected ? (
        <CardEmpty>
          <p>Connect Google Search Console to see clicks and impressions.</p>
          <Link
            {...searchPerformanceLink}
            className="btn btn-primary btn-sm mt-3"
          >
            Connect Search Console
          </Link>
        </CardEmpty>
      ) : (
        (() => {
          const { totals, prevTotals } = report;
          const deltaTitle = "vs previous 28 days";
          return (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DeltaStatTile
                label="Clicks"
                value={formatCount(totals.clicks)}
                delta={percentDelta(totals.clicks, prevTotals.clicks)}
                deltaTitle={deltaTitle}
              />
              <DeltaStatTile
                label="Impressions"
                value={formatCount(totals.impressions)}
                delta={percentDelta(totals.impressions, prevTotals.impressions)}
                deltaTitle={deltaTitle}
              />
              <DeltaStatTile
                label="CTR"
                value={formatCtr(totals.ctr)}
                delta={percentDelta(totals.ctr, prevTotals.ctr)}
                deltaTitle={deltaTitle}
              />
              <DeltaStatTile
                label="Avg position"
                value={formatPosition(totals.position)}
                delta={positionDelta(totals.position, prevTotals.position)}
                deltaTitle={deltaTitle}
              />
            </div>
          );
        })()
      )}
    </DashboardCard>
  );
}
