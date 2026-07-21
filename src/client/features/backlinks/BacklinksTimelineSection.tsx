import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { InsightIcon } from "@/client/components/InsightTile";
import { useChartWidth } from "@/client/features/rank-tracking/RankTrackingTrendChart";
import { getBacklinksTimeline } from "@/serverFunctions/backlinks";

type TimelineRow = {
  label: string;
  gained: number;
  /** Negative for the diverging bar. */
  lostNegative: number;
  lost: number;
  referringDomains: number | null;
};

/** Recharts types tooltip payloads as any; narrow structurally instead. */
function isTimelineRow(value: unknown): value is TimelineRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "label" in value &&
    "gained" in value &&
    "lost" in value
  );
}

function monthLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/** Won vs lost referring domains per month, with the cumulative line. */
export function BacklinksTimelineSection({
  projectId,
  target,
}: {
  projectId: string;
  target: string;
}) {
  const timelineQuery = useQuery({
    enabled: target.trim() !== "",
    queryKey: ["backlinks-timeline", projectId, target],
    queryFn: () => getBacklinksTimeline({ data: { projectId, target } }),
    staleTime: 30 * 60_000,
    retry: 1,
  });

  const { containerRef, width: chartWidth } = useChartWidth();
  const height = 220;

  const points = timelineQuery.data?.points ?? [];
  const rows: TimelineRow[] = points.map((point) => ({
    label: monthLabel(point.date),
    gained: point.newReferringDomains,
    lostNegative: -point.lostReferringDomains,
    lost: point.lostReferringDomains,
    referringDomains: point.referringDomains,
  }));

  if (!timelineQuery.isPending && rows.length < 2) return null;

  return (
    <section className="rounded-2xl border border-base-300 bg-base-100 p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <InsightIcon icon={CalendarRange} tone="primary" />
        Referring domains — won vs lost
      </h2>
      <p className="mt-0.5 text-xs text-base-content/50">
        Monthly gains (green) and losses (red) over the last year, with total
        referring domains as the line.
      </p>
      {timelineQuery.isPending ? (
        <div className="flex items-center justify-center py-14">
          <span className="loading loading-spinner loading-sm" />
        </div>
      ) : (
        <div
          ref={containerRef}
          className="mt-3 w-full min-w-0"
          style={{ height }}
        >
          {chartWidth > 0 ? (
            <ComposedChart
              width={chartWidth}
              height={height}
              data={rows}
              stackOffset="sign"
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                opacity={0.1}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#888" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="delta"
                tick={{ fontSize: 10, fill: "#888" }}
                tickLine={false}
                axisLine={false}
                width={34}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="total"
                orientation="right"
                tick={{ fontSize: 10, fill: "#888" }}
                tickLine={false}
                axisLine={false}
                width={40}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(150,150,150,0.08)" }}
                content={(props: TooltipContentProps<number, string>) => {
                  const candidates = (props.payload ?? []).map(
                    (entry: { payload?: unknown }) => entry.payload,
                  );
                  const row = candidates[0];
                  if (!props.active || !isTimelineRow(row)) return null;
                  return (
                    <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs shadow">
                      <div className="pb-1 font-medium">{row.label}</div>
                      <div className="text-success">+{row.gained} won</div>
                      <div className="text-error">−{row.lost} lost</div>
                      {row.referringDomains != null ? (
                        <div className="text-base-content/60">
                          {row.referringDomains.toLocaleString()} referring
                          domains total
                        </div>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Bar
                yAxisId="delta"
                dataKey="gained"
                stackId="delta"
                fill="#16a34a"
                fillOpacity={0.75}
                isAnimationActive={false}
              />
              <Bar
                yAxisId="delta"
                dataKey="lostNegative"
                stackId="delta"
                fill="#dc2626"
                fillOpacity={0.65}
                isAnimationActive={false}
              />
              <Line
                yAxisId="total"
                type="monotone"
                dataKey="referringDomains"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          ) : null}
        </div>
      )}
    </section>
  );
}
