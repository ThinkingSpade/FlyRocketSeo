import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  PositionBucketLegend,
  PositionDistributionChart,
} from "@/client/features/rank-tracking/PositionDistributionChart";
import { ProjectEventsStrip } from "@/client/features/rank-tracking/ProjectEventsMarkers";
import type { ProjectEventLike } from "@/client/features/rank-tracking/projectEventMarkers";
import type { RankConfigTrendPoint } from "@/serverFunctions/rank-tracking";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import {
  buildRankBlockModel,
  type ReportRankBlockModel,
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
 * One tracked domain's slice of the report, rendered from the computed block
 * model — the same object that gets frozen into public share snapshots, so
 * the live page and a shared link can never disagree.
 */
export function RankBlockView({ block }: { block: ReportRankBlockModel }) {
  const avgDelta =
    block.avgPosition !== null && block.avgPositionPrevious !== null
      ? block.avgPosition - block.avgPositionPrevious
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{block.domain}</h3>
        <span className="text-[11px] text-base-content/50">
          {block.keywordCount} keywords tracked · {block.device}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="Visibility"
          value={
            block.visibility === null
              ? "—"
              : `${formatNumber(block.visibility)}%`
          }
          delta={block.visibilityDelta}
        />
        <StatTile
          label="Ranking keywords"
          value={String(block.ranking)}
          delta={block.rankingDelta}
        />
        <StatTile
          label="Avg position"
          value={formatPosition(block.avgPosition)}
          delta={avgDelta}
          deltaGoodWhen="down"
        />
        <StatTile
          label="Top 3 / Top 10"
          value={`${block.top3} / ${block.top10}`}
        />
      </div>

      {block.chartData.length > 1 ? (
        <div className="break-inside-avoid space-y-2">
          <PositionBucketLegend />
          <PositionDistributionChart
            data={block.chartData}
            height={190}
            eventMarkers={block.eventMarkers}
          />
          <ProjectEventsStrip markers={block.eventMarkers} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <MoversTable
          heading={`Top improvements (${block.movers.improvedTotal})`}
          movers={block.movers.improved}
          emptyLabel="No improvements in this period."
        />
        <MoversTable
          heading={`Biggest declines (${block.movers.declinedTotal})`}
          movers={block.movers.declined}
          emptyLabel="No declines in this period."
        />
      </div>
    </div>
  );
}

/** Query-aware wrapper used on the live report page. */
export function ReportRankBlock({
  domain,
  devices,
  keywordCount,
  rows,
  rowsPending,
  rowsError,
  trend,
  events,
}: {
  domain: string;
  devices: "both" | "desktop" | "mobile";
  keywordCount: number;
  rows: RankTrackingRow[] | undefined;
  rowsPending: boolean;
  rowsError: boolean;
  trend: RankConfigTrendPoint[] | undefined;
  events: ProjectEventLike[];
}) {
  const block = useMemo(
    () =>
      rows && rows.length > 0
        ? buildRankBlockModel({
            domain,
            devices,
            keywordCount,
            rows,
            trend: trend ?? [],
            events,
          })
        : null,
    [domain, devices, keywordCount, rows, trend, events],
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
  if (!block) {
    return (
      <SectionNote>
        No rank checks recorded for {domain} yet — run a check to include it.
      </SectionNote>
    );
  }

  return <RankBlockView block={block} />;
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
