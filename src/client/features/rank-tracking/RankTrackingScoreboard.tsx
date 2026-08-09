import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Crosshair,
  Megaphone,
  Minus,
} from "@phosphor-icons/react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { BarList } from "@/client/components/BarList";
import { InsightIcon, InsightTile } from "@/client/components/InsightTile";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import type { RankPositionMatrixCell } from "@/serverFunctions/rank-tracking";
import type { RankTrackingRow } from "@/types/schemas/rank-tracking";
import {
  computeBucketTransitions,
  computeScorecards,
} from "./rankTrackingScorecards";
import {
  computeAveragePositionTrend,
  computeVisibilityTrend,
} from "./visibilityTrend";

const AVERAGE_POSITION_COLOR = "#2563eb";

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
  // The Visibility tile states one number; this is the shape behind it. Same
  // series the Visibility trend chart draws further down the page, from the
  // same two inputs, so the tile and the chart cannot disagree.
  const visibilityTrend = useMemo(
    () =>
      computeVisibilityTrend(
        cells,
        new Map(rows.map((r) => [r.trackingKeywordId, r.searchVolume])),
      )
        .map((point) => point.visibility)
        .filter((visibility): visibility is number => visibility != null),
    [cells, rows],
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
          trend={visibilityTrend}
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
          <div className="mt-2">
            <BarList
              // Scaled to the total tracked, not to the biggest bucket. These
              // are parts of one whole, so a full-width top bar would say
              // "most keywords are here" when it only means "more than the
              // other three".
              max={transitions.reduce((sum, b) => sum + b.current, 0)}
              items={transitions.map((bucket) => {
                const delta = bucket.current - bucket.previous;
                const isNotRanking = bucket.label === "Not ranking";
                // For "not ranking", growth is bad — flip the delta color.
                const improvedHere = isNotRanking ? delta < 0 : delta > 0;
                return {
                  id: bucket.label,
                  label: bucket.label,
                  value: bucket.current,
                  display: (
                    <>
                      <span className="text-base-content/50">
                        {bucket.previous}
                      </span>{" "}
                      → <span className="font-semibold">{bucket.current}</span>
                      {delta !== 0 ? (
                        <span
                          className={
                            improvedHere ? "text-success" : "text-error"
                          }
                        >
                          {" "}
                          ({delta > 0 ? "+" : ""}
                          {delta})
                        </span>
                      ) : null}
                    </>
                  ),
                };
              })}
            />
          </div>
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
  const theme = useChartTheme();
  const base = useChartBase(theme);
  const height = 150;

  // Memoized because it feeds the options below, which would otherwise be
  // rebuilt on every render of the surrounding scoreboard.
  const rows = useMemo(
    () =>
      points.map((point) => ({
        label: formatDate(point.checkedAt),
        averagePosition: Math.round(point.averagePosition * 100) / 100,
      })),
    [points],
  );

  const options = useMemo(
    () => ({
      ...base,
      tooltip: {
        ...base.tooltip,
        dangerousHtmlFormatter: (params: unknown) => {
          const [first] = tooltipRows(params);
          if (!first) return "";
          return [
            `<div style="font-size:11px;opacity:0.6">${first.axisValue}</div>`,
            `<div style="font-size:13px;font-weight:500">avg #${(first.value ?? 0).toFixed(1)}</div>`,
          ].join("");
        },
      },
      xAxis: {
        ...base.axisCommon,
        type: "category" as const,
        data: rows.map((row) => row.label),
        boundaryGap: false,
        // CartesianGrid was horizontal-only (`vertical={false}`).
        splitLine: { show: false },
        axisLabel: {
          ...base.axisCommon.axisLabel,
          // ECharts' own overlap avoidance, in place of Recharts' minTickGap.
          hideOverlap: true,
        },
      },
      yAxis: {
        ...base.axisCommon,
        type: "value" as const,
        // Rank #1 at the TOP, so a line climbing means positions improving.
        // Without this the chart says the opposite of what it means.
        inverse: true,
        // Recharts' domain={["auto", "auto"]}: fit the data rather than
        // anchoring to zero, which ECharts would otherwise do.
        scale: true,
        minInterval: 1,
      },
      series: [
        {
          type: "line" as const,
          name: "Average position",
          data: rows.map((row) => row.averagePosition),
          smooth: true,
          // Hollow ring on the hovered point — surface fill, series colour on
          // the border — the marker the Recharts charts drew on hover.
          symbol: "circle" as const,
          symbolSize: 8,
          showSymbol: false,
          lineStyle: { width: 2, color: AVERAGE_POSITION_COLOR },
          itemStyle: { color: AVERAGE_POSITION_COLOR },
          emphasis: {
            itemStyle: {
              color: theme.surface,
              borderColor: AVERAGE_POSITION_COLOR,
              borderWidth: 2,
            },
          },
        },
      ],
    }),
    [base, rows, theme.surface],
  );

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
        <Chart
          echarts={echarts}
          options={options}
          height={height}
          isDarkMode={theme.isDark}
          className="mt-2 w-full min-w-0"
        />
      )}
    </div>
  );
}
