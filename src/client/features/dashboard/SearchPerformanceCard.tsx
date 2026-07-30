import { useQuery } from "@tanstack/react-query";
import { resolveQueryState } from "@/client/components/state/queryState";
import { QueryStateBoundary } from "@/client/components/state/QueryStateBoundary";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { GscAccessNotice } from "@/client/features/gsc/GscAccessNotice";
import { GoogleGlyphMuted } from "@/client/features/gsc/GoogleGlyph";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  CardEmpty,
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
  // A bound-but-broken property reports why; only a genuinely unbound project
  // gets the first-run prompt.
  const accessFailureReason =
    report && !report.connected ? report.reason : "not_connected";

  const state = resolveQueryState({
    isPending: reportQuery.isPending,
    isError: reportQuery.isError,
    connected: report?.connected,
    // One report object, not a row set. Zero clicks is a valid answer, so the
    // presence of the report is what counts — never the size of its numbers.
    rowCount: report?.connected ? 1 : 0,
  });

  return (
    <DashboardCard
      icon={GoogleGlyphMuted}
      title="Search performance · last 28 days"
      headerLink={searchPerformanceLink}
    >
      <QueryStateBoundary
        state={state}
        loading={<CardTilesSkeleton />}
        errorMessage={getStandardErrorMessage(reportQuery.error)}
        notConnected={
          <CardEmpty>
            <GscAccessNotice
              reason={accessFailureReason}
              connectLink={searchPerformanceLink}
            />
          </CardEmpty>
        }
        // Reachable only if the report resolves without saying whether it
        // connected. There is deliberately no empty state for zero clicks: a
        // property with no traffic still has a valid report, and four zeroes are
        // the honest answer rather than an absence.
        emptyTitle="No report came back"
        emptyBody="Search Console answered without data for the last 28 days."
      >
        {report?.connected
          ? (() => {
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
                    delta={percentDelta(
                      totals.impressions,
                      prevTotals.impressions,
                    )}
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
          : null}
      </QueryStateBoundary>
    </DashboardCard>
  );
}
