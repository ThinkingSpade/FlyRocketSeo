import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { renderEventMarkerLines } from "./ProjectEventsMarkers";
import type { ProjectEventMarker } from "./projectEventMarkers";
import { formatDateTick, useChartWidth } from "./RankTrackingTrendChart";

const POSITION_BUCKETS = [
  { key: "top3", label: "Top 3", color: "#16a34a" },
  { key: "top4to10", label: "4–10", color: "#2563eb" },
  { key: "top11to20", label: "11–20", color: "#f59e0b" },
  { key: "notRanking", label: "Not in top 20", color: "#6b7280" },
] as const;

interface PositionDistributionPoint {
  checkedAt: number;
  top3: number;
  top4to10: number;
  top11to20: number;
  notRanking: number;
}

/** Narrowed recharts tooltip payload entry (typed `any` upstream). */
interface PayloadEntry {
  dataKey?: string | number;
  value?: number | string | null;
}

/** Legend chips for the bucket colors — render wherever the layout needs. */
export function PositionBucketLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {POSITION_BUCKETS.map((bucket) => (
        <span
          key={bucket.key}
          className="inline-flex items-center gap-1 text-[11px] text-base-content/60"
        >
          <span
            className="size-2 rounded-sm"
            style={{ backgroundColor: bucket.color }}
          />
          {bucket.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Stacked how-many-keywords-rank-where area chart, shared by the rank-tracking
 * overview and the client report. Callers own the surrounding card, legend,
 * range controls, and loading/empty states.
 */
export function PositionDistributionChart({
  data,
  height = 220,
  eventMarkers,
}: {
  data: PositionDistributionPoint[];
  height?: number;
  eventMarkers?: ProjectEventMarker[];
}) {
  const { containerRef, width } = useChartWidth();

  return (
    <div ref={containerRef} className="w-full min-w-0" style={{ height }}>
      {width > 0 ? (
        <AreaChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.1}
            vertical={false}
          />
          <XAxis
            dataKey="checkedAt"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatDateTick}
            tick={{ fontSize: 10, fill: "#888" }}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "#888" }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            content={(props: TooltipContentProps<number, string>) => {
              const { active, payload, label } = props;
              if (!active || !payload?.length || typeof label !== "number") {
                return null;
              }
              const byKey = new Map(
                payload.map((p: PayloadEntry) => [
                  String(p.dataKey),
                  typeof p.value === "number" ? p.value : 0,
                ]),
              );
              return <DistributionTooltip label={label} byKey={byKey} />;
            }}
            cursor={{ stroke: "rgba(150,150,150,0.3)" }}
          />
          {POSITION_BUCKETS.map((bucket) => (
            <Area
              key={bucket.key}
              type="monotone"
              dataKey={bucket.key}
              name={bucket.label}
              stackId="positions"
              stroke={bucket.color}
              fill={bucket.color}
              fillOpacity={0.7}
              isAnimationActive={false}
            />
          ))}
          {/* After the series: the stack fills the full plot height, so
              markers rendered under it would be invisible. */}
          {eventMarkers ? renderEventMarkerLines(eventMarkers) : null}
        </AreaChart>
      ) : null}
    </div>
  );
}

function DistributionTooltip({
  label,
  byKey,
}: {
  label: number;
  byKey: Map<string, number>;
}) {
  return (
    <div className="rounded-md border border-base-300 bg-base-100 px-3 py-2 shadow-sm space-y-0.5">
      <p className="text-xs text-base-content/60">
        {new Date(label).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      {POSITION_BUCKETS.map((bucket) => (
        <p key={bucket.key} className="text-xs flex items-center gap-1.5">
          <span
            className="size-2 rounded-sm"
            style={{ backgroundColor: bucket.color }}
          />
          <span className="text-base-content/60">{bucket.label}:</span>
          <span className="font-medium tabular-nums">
            {byKey.get(bucket.key) ?? 0}
          </span>
        </p>
      ))}
    </div>
  );
}
