import { useMemo } from "react";
import { Megaphone } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { InsightIcon } from "@/client/components/InsightTile";
import type { RankPositionMatrixCell } from "@/serverFunctions/rank-tracking";
import { useChartWidth } from "./RankTrackingTrendChart";
import { computeVisibilityTrend } from "./visibilityTrend";

type ChartRow = {
  label: string;
  visibility: number;
};

/** Recharts types tooltip payloads as any; narrow structurally instead. */
function isChartRow(value: unknown): value is ChartRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "label" in value &&
    "visibility" in value
  );
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Share-of-voice over time: the scorecard's volume×CTR-weighted visibility
 * replayed across every stored check. Pure client-side over the matrix the
 * "By date" view already loads.
 */
export function VisibilityTrendChart({
  cells,
  volumeByKeywordId,
}: {
  cells: RankPositionMatrixCell[];
  volumeByKeywordId: Map<string, number | null>;
}) {
  const points = useMemo(
    () =>
      computeVisibilityTrend(cells, volumeByKeywordId).filter(
        (point): point is typeof point & { visibility: number } =>
          point.visibility != null,
      ),
    [cells, volumeByKeywordId],
  );

  const { containerRef, width: chartWidth } = useChartWidth();
  const height = 180;
  if (points.length < 2) return null;

  const rows: ChartRow[] = points.map((point) => ({
    label: formatDate(point.checkedAt),
    visibility: Math.round(point.visibility * 10) / 10,
  }));
  const first = rows[0].visibility;
  const last = rows[rows.length - 1].visibility;
  const delta = Math.round((last - first) * 10) / 10;

  return (
    <div className="mb-3 rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={Megaphone} tone="primary" />
          Visibility trend
        </h3>
        <span className="text-xs text-base-content/60 tabular-nums">
          {last}% now
          <span
            className={
              delta > 0
                ? "text-success"
                : delta < 0
                  ? "text-error"
                  : "text-base-content/50"
            }
          >
            {" "}
            ({delta > 0 ? "+" : ""}
            {delta} pts over {rows.length} checks)
          </span>
        </span>
      </div>
      <p className="mt-0.5 text-xs text-base-content/50">
        Volume-weighted share of click potential captured by your rankings — the
        scorecard&rsquo;s visibility, per check.
      </p>
      <div
        ref={containerRef}
        className="mt-2 w-full min-w-0"
        style={{ height }}
      >
        {chartWidth > 0 ? (
          <LineChart
            width={chartWidth}
            height={height}
            data={rows}
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
              minTickGap={24}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(value: number) => `${value}%`}
              tick={{ fontSize: 10, fill: "#888" }}
              tickLine={false}
              axisLine={false}
              width={38}
            />
            <Tooltip
              cursor={{ stroke: "rgba(150,150,150,0.3)" }}
              content={(props: TooltipContentProps<number, string>) => {
                const candidates = (props.payload ?? []).map(
                  (entry: { payload?: unknown }) => entry.payload,
                );
                const row = candidates[0];
                if (!props.active || !isChartRow(row)) return null;
                return (
                  <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs shadow">
                    <div className="font-medium">{row.label}</div>
                    <div>{row.visibility}% visibility</div>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="visibility"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 2.5 }}
              isAnimationActive={false}
            />
          </LineChart>
        ) : null}
      </div>
    </div>
  );
}
