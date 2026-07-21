import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Crosshair,
  Megaphone,
  Minus,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { InsightIcon, InsightTile } from "@/client/components/InsightTile";
import type { RankPositionMatrixCell } from "@/serverFunctions/rank-tracking";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import { useChartWidth } from "./RankTrackingTrendChart";
import {
  computeBucketTransitions,
  computeScorecards,
} from "./rankTrackingScorecards";
import { computeAveragePositionTrend } from "./visibilityTrend";

type ChartRow = { label: string; averagePosition: number };

/** Recharts types tooltip payloads as any; narrow structurally instead. */
function isChartRow(value: unknown): value is ChartRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "label" in value &&
    "averagePosition" in value
  );
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Ubersuggest-style header for a tracked domain: movers since the previous
 * check, visibility, bucket transitions, and the average-position trend.
 * Everything derives from the rows and matrix the view already loads.
 */
export function RankTrackingScoreboard({
  rows,
  device,
  cells,
}: {
  rows: RankTrackingRow[];
  device: "desktop" | "mobile";
  cells: RankPositionMatrixCell[];
}) {
  const cards = useMemo(() => computeScorecards(rows, device), [rows, device]);
  const transitions = useMemo(
    () => computeBucketTransitions(rows, device),
    [rows, device],
  );

  if (rows.length === 0) return null;

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InsightTile
          icon={Megaphone}
          label="Visibility"
          value={
            cards.visibility != null ? `${Math.round(cards.visibility)}%` : "—"
          }
          hint={
            cards.visibilityDelta != null
              ? `${cards.visibilityDelta >= 0 ? "+" : ""}${cards.visibilityDelta.toFixed(1)} pts vs previous`
              : "Volume-weighted click potential"
          }
          tone="primary"
        />
        <InsightTile
          icon={ArrowUpRight}
          label="Moved up"
          value={cards.improved}
          tone={cards.improved > 0 ? "success" : "neutral"}
        />
        <InsightTile
          icon={ArrowDownRight}
          label="Moved down"
          value={cards.declined}
          tone={cards.declined > 0 ? "error" : "neutral"}
        />
        <InsightTile icon={Minus} label="Unchanged" value={cards.unchanged} />
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-2">
        <div className="rounded-lg border border-base-300 bg-base-100 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <InsightIcon icon={Crosshair} tone="primary" />
            Current search rankings
          </h3>
          <p className="mt-0.5 text-xs text-base-content/50">
            Keywords per position bucket — previous check → now.
          </p>
          <ul className="mt-2 space-y-1.5">
            {transitions.map((bucket) => {
              const delta = bucket.current - bucket.previous;
              const isNotRanking = bucket.label === "Not ranking";
              // For "not ranking", growth is bad — flip the delta color.
              const improvedHere = isNotRanking ? delta < 0 : delta > 0;
              return (
                <li
                  key={bucket.label}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-base-content/70">{bucket.label}</span>
                  <span className="tabular-nums">
                    <span className="text-base-content/50">
                      {bucket.previous}
                    </span>{" "}
                    → <span className="font-semibold">{bucket.current}</span>
                    {delta !== 0 ? (
                      <span
                        className={improvedHere ? "text-success" : "text-error"}
                      >
                        {" "}
                        ({delta > 0 ? "+" : ""}
                        {delta})
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <AveragePositionCard cells={cells} />
      </div>
    </div>
  );
}

function AveragePositionCard({ cells }: { cells: RankPositionMatrixCell[] }) {
  const points = useMemo(
    () =>
      computeAveragePositionTrend(cells).filter(
        (point): point is typeof point & { averagePosition: number } =>
          point.averagePosition != null,
      ),
    [cells],
  );
  const { containerRef, width: chartWidth } = useChartWidth();
  const height = 150;

  const rows: ChartRow[] = points.map((point) => ({
    label: formatDate(point.checkedAt),
    averagePosition: Math.round(point.averagePosition * 100) / 100,
  }));
  const first = rows[0]?.averagePosition;
  const last = rows[rows.length - 1]?.averagePosition;
  // Positions improve downward, so a negative delta is the good direction.
  const delta =
    first != null && last != null
      ? Math.round((first - last) * 100) / 100
      : null;

  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={ArrowUpRight} tone="primary" />
          Average position
        </h3>
        {first != null && last != null ? (
          <span className="text-xs text-base-content/60 tabular-nums">
            {first.toFixed(1)} →{" "}
            <span className="font-semibold">{last.toFixed(1)}</span>
            {delta != null && delta !== 0 ? (
              <span className={delta > 0 ? "text-success" : "text-error"}>
                {" "}
                ({delta > 0 ? "+" : ""}
                {delta.toFixed(1)})
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      {rows.length < 2 ? (
        <div className="mt-2 rounded-lg border border-dashed border-base-300 p-6 text-center text-xs text-base-content/60">
          The trend fills in after the next check.
        </div>
      ) : (
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
                reversed
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "#888" }}
                tickLine={false}
                axisLine={false}
                width={30}
                allowDecimals={false}
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
                      <div>avg #{row.averagePosition.toFixed(1)}</div>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="averagePosition"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 2.5 }}
                isAnimationActive={false}
              />
            </LineChart>
          ) : null}
        </div>
      )}
    </div>
  );
}
