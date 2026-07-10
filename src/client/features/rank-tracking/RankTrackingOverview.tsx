import { useMemo, useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getRankConfigTrend } from "@/serverFunctions/rank-tracking";
import {
  PositionBucketLegend,
  PositionDistributionChart,
} from "./PositionDistributionChart";
import { ProjectEventsStrip } from "./ProjectEventsMarkers";
import {
  buildEventMarkers,
  type ProjectEventLike,
} from "./projectEventMarkers";
import { TrendRangeToggle } from "./RankTrackingTrendChart";

export function RankTrackingOverview({
  device,
  projectId,
  configId,
  events,
  onManageEvents,
}: {
  device: "desktop" | "mobile";
  projectId: string;
  configId: string;
  /** Project event journal — plotted as ⚑ markers on the trend. */
  events?: ProjectEventLike[];
  onManageEvents?: () => void;
}) {
  const [sinceDays, setSinceDays] = useState(730);

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ["rankConfigTrend", projectId, configId, device, sinceDays],
    queryFn: () =>
      getRankConfigTrend({
        data: { projectId, configId, device, sinceDays },
      }),
  });

  const chartData = useMemo(
    () =>
      (trend ?? []).map((p) => ({
        checkedAt: new Date(p.checkedAt).getTime(),
        top3: p.top3,
        top4to10: p.top4to10,
        top11to20: p.top11to20,
        notRanking: p.notRanking,
      })),
    [trend],
  );

  const eventMarkers = useMemo(
    () =>
      buildEventMarkers(
        events ?? [],
        chartData.map((row) => row.checkedAt),
      ),
    [events, chartData],
  );

  return (
    <div className="px-4 pt-4 pb-4">
      <div className="rounded-lg border border-base-300 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Position distribution</span>
          <div className="flex items-center gap-1.5">
            {onManageEvents && (
              <button
                type="button"
                className="btn btn-ghost btn-xs gap-1 text-base-content/60"
                title="Log site events (content published, redirects fixed…) as chart markers"
                onClick={onManageEvents}
              >
                <Flag className="size-3" />
                Events
                {(events?.length ?? 0) > 0 && (
                  <span className="tabular-nums">{events?.length}</span>
                )}
              </button>
            )}
            <TrendRangeToggle value={sinceDays} onChange={setSinceDays} />
          </div>
        </div>

        <PositionBucketLegend />

        {trendLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="size-4 animate-spin text-base-content/50" />
          </div>
        ) : chartData.length <= 1 ? (
          <div className="rounded-lg border border-dashed border-base-300 p-8 text-center text-xs text-base-content/60">
            {chartData.length === 0
              ? "No history yet — run a check to start tracking positions over time."
              : "Only 1 check so far — the trend fills in after the next check."}
          </div>
        ) : (
          <PositionDistributionChart
            data={chartData}
            eventMarkers={eventMarkers}
          />
        )}

        <ProjectEventsStrip markers={eventMarkers} onManage={onManageEvents} />
      </div>
    </div>
  );
}
