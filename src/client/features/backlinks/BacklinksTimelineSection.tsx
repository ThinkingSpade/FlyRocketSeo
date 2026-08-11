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
import { Empty } from "@cloudflare/kumo/components/empty";
import { Loader } from "@cloudflare/kumo/components/loader";
import { ChartActiveDot } from "@/client/components/chart/ChartActiveDot";
import {
  CHART_AXIS_TICK,
  CHART_CURSOR_LINE,
  CHART_X_TICK_GAP,
} from "@/client/components/chart/chartTheme";
import { InsightIcon } from "@/client/components/InsightTile";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { useChartWidth } from "@/client/features/rank-tracking/RankTrackingTrendChart";
import { getBacklinksTimeline } from "@/serverFunctions/backlinks";
import { useMeteredQuery } from "@/client/lib/useMeteredQuery";
import {
  classifyNumericSeries,
  type NumericSeriesInformation,
} from "./backlinksChartInformation";

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
  authorized,
  runNonce,
}: {
  projectId: string;
  target: string;
  authorized: boolean;
  runNonce: number;
}) {
  const timelineQuery = useMeteredQuery({
    authorized,
    runNonce,
    enabled: target.trim() !== "",
    queryKey: ["backlinks-timeline", projectId, target],
    queryFn: () => getBacklinksTimeline({ data: { projectId, target } }),
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
  const gainedInformation = classifyNumericSeries(
    rows.map((row) => row.gained),
  );
  const lostInformation = classifyNumericSeries(rows.map((row) => row.lost));
  const totalInformation = classifyNumericSeries(
    rows.map((row) => row.referringDomains),
  );
  const hasRecordedActivity =
    isActivitySeries(gainedInformation) || isActivitySeries(lostInformation);
  const emptyPresentation =
    gainedInformation.kind === "insufficient"
      ? {
          title: "Not enough history",
          description: "At least 2 monthly snapshots are needed.",
        }
      : !hasRecordedActivity && totalInformation.kind !== "varying"
        ? {
            title:
              "No referring-domain gains or losses were recorded in this period.",
            description: undefined,
          }
        : null;

  return (
    <section className="rounded-xl border border-base-300 bg-base-100 p-4">
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
          <Loader size="sm" />
        </div>
      ) : timelineQuery.isError ? (
        <InlineQueryError
          className="mt-3"
          message="The backlink timeline could not be loaded."
          retrying={timelineQuery.isFetching}
          onRetry={() => void timelineQuery.refetch()}
        />
      ) : emptyPresentation ? (
        <Empty
          size="sm"
          className="mt-3 h-[220px] rounded-none border-0 bg-transparent"
          title={emptyPresentation.title}
          description={emptyPresentation.description}
        />
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
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                minTickGap={CHART_X_TICK_GAP}
              />
              <YAxis
                yAxisId="delta"
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={34}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="total"
                orientation="right"
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={40}
                allowDecimals={false}
              />
              <Tooltip
                cursor={CHART_CURSOR_LINE}
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
                fill="var(--color-success)"
                fillOpacity={0.75}
                isAnimationActive={false}
              />
              <Bar
                yAxisId="delta"
                dataKey="lostNegative"
                stackId="delta"
                fill="var(--color-error)"
                fillOpacity={0.65}
                isAnimationActive={false}
              />
              <Line
                yAxisId="total"
                type="monotone"
                dataKey="referringDomains"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
                activeDot={<ChartActiveDot />}
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

function isActivitySeries(information: NumericSeriesInformation) {
  return information.kind === "varying" || information.kind === "constant";
}
