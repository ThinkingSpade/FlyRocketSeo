import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  PositionBucketLegend,
  PositionDistributionChart,
} from "@/client/features/rank-tracking/PositionDistributionChart";
import { ProjectEventsStrip } from "@/client/features/rank-tracking/ProjectEventsMarkers";
import {
  buildEventMarkers,
  type ProjectEventLike,
} from "@/client/features/rank-tracking/projectEventMarkers";
import { computeScorecards } from "@/client/features/rank-tracking/rankTrackingScorecards";
import type { RankConfigTrendPoint } from "@/serverFunctions/rank-tracking";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import {
  computeAveragePositions,
  computeMovers,
  type ReportMover,
} from "./reportData";
import {
  formatNumber,
  formatPosition,
  MovementCell,
  SectionNote,
  StatTile,
} from "./ReportPrimitives";

/**
 * One tracked domain's slice of the report: scorecard tiles, the position
 * distribution over the period (with ⚑ event markers), and the biggest
 * ranking movements. Purely presentational — the page owns the queries.
 */
export function ReportRankBlock({
  domain,
  device,
  keywordCount,
  rows,
  rowsPending,
  rowsError,
  trend,
  events,
}: {
  domain: string;
  device: "desktop" | "mobile";
  keywordCount: number;
  rows: RankTrackingRow[] | undefined;
  rowsPending: boolean;
  rowsError: boolean;
  trend: RankConfigTrendPoint[] | undefined;
  events: ProjectEventLike[];
}) {
  const chartData = useMemo(
    () =>
      (trend ?? []).map((point) => ({
        checkedAt: new Date(point.checkedAt).getTime(),
        top3: point.top3,
        top4to10: point.top4to10,
        top11to20: point.top11to20,
        notRanking: point.notRanking,
      })),
    [trend],
  );
  const eventMarkers = useMemo(
    () =>
      buildEventMarkers(
        events,
        chartData.map((row) => row.checkedAt),
      ),
    [events, chartData],
  );

  if (rowsError) {
    return (
      <SectionNote>
        Rank data for {domain} could not be loaded for this report.
      </SectionNote>
    );
  }
  if (rowsPending) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-base-300 py-10">
        <Loader2 className="size-4 animate-spin text-base-content/50" />
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <SectionNote>
        No rank checks recorded for {domain} yet — run a check to include it.
      </SectionNote>
    );
  }

  const cards = computeScorecards(rows, device);
  const averages = computeAveragePositions(rows, device);
  const movers = computeMovers(rows, device);
  const avgDelta =
    averages.current !== null && averages.previous !== null
      ? averages.current - averages.previous
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{domain}</h3>
        <span className="text-[11px] text-base-content/50">
          {keywordCount} keywords tracked · {device}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="Visibility"
          value={
            cards.visibility === null
              ? "—"
              : `${formatNumber(cards.visibility)}%`
          }
          delta={cards.visibilityDelta}
        />
        <StatTile
          label="Ranking keywords"
          value={String(cards.ranking)}
          delta={cards.rankingDelta}
        />
        <StatTile
          label="Avg position"
          value={formatPosition(averages.current)}
          delta={avgDelta}
          deltaGoodWhen="down"
        />
        <StatTile
          label="Top 3 / Top 10"
          value={`${cards.top3} / ${cards.top10}`}
        />
      </div>

      {chartData.length > 1 ? (
        <div className="break-inside-avoid space-y-2">
          <PositionBucketLegend />
          <PositionDistributionChart
            data={chartData}
            height={190}
            eventMarkers={eventMarkers}
          />
          <ProjectEventsStrip markers={eventMarkers} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <MoversTable
          heading={`Top improvements (${movers.improvedTotal})`}
          movers={movers.improved}
          emptyLabel="No improvements in this period."
        />
        <MoversTable
          heading={`Biggest declines (${movers.declinedTotal})`}
          movers={movers.declined}
          emptyLabel="No declines in this period."
        />
      </div>
    </div>
  );
}

function MoversTable({
  heading,
  movers,
  emptyLabel,
}: {
  heading: string;
  movers: ReportMover[];
  emptyLabel: string;
}) {
  return (
    <div className="break-inside-avoid">
      <p className="pb-1 text-xs font-semibold text-base-content/70">
        {heading}
      </p>
      {movers.length === 0 ? (
        <p className="text-xs text-base-content/50">{emptyLabel}</p>
      ) : (
        <ul>
          {movers.map((mover) => (
            <li
              key={mover.keyword}
              className="flex items-baseline justify-between gap-3 border-b border-base-200 py-1 text-sm last:border-0"
            >
              <span className="min-w-0 flex-1 truncate" title={mover.keyword}>
                {mover.keyword}
              </span>
              <span className="shrink-0 whitespace-nowrap">
                <MovementCell
                  from={mover.previousPosition}
                  to={mover.currentPosition}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
