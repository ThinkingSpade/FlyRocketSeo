import { useMemo } from "react";
import { Megaphone } from "@phosphor-icons/react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { InsightIcon } from "@/client/components/InsightTile";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import type { RankPositionMatrixCell } from "@/serverFunctions/rank-tracking";
import { computeVisibilityTrend } from "./visibilityTrend";

const VISIBILITY_COLOR = "#2563eb";

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

  const theme = useChartTheme();
  const base = useChartBase(theme);
  const height = 180;

  const rows = useMemo(
    () =>
      points.map((point) => ({
        label: formatDate(point.checkedAt),
        visibility: Math.round(point.visibility * 10) / 10,
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
            `<div style="font-size:13px;font-weight:500">${first.value ?? 0}% visibility</div>`,
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
        // A share of a whole, so the axis is the whole: 0–100 fixed, or a flat
        // series would look like it filled the chart.
        min: 0,
        max: 100,
        axisLabel: {
          ...base.axisCommon.axisLabel,
          formatter: (value: number) => `${value}%`,
        },
      },
      series: [
        {
          type: "line" as const,
          name: "Visibility",
          data: rows.map((row) => row.visibility),
          smooth: true,
          // Hollow ring on the hovered point — surface fill, series colour on
          // the border — the marker the Recharts charts drew on hover.
          symbol: "circle" as const,
          symbolSize: 8,
          showSymbol: false,
          lineStyle: { width: 2, color: VISIBILITY_COLOR },
          itemStyle: { color: VISIBILITY_COLOR },
          emphasis: {
            itemStyle: {
              color: theme.surface,
              borderColor: VISIBILITY_COLOR,
              borderWidth: 2,
            },
          },
        },
      ],
    }),
    [base, rows, theme.surface],
  );

  if (rows.length < 2) return null;

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
      <Chart
        echarts={echarts}
        options={options}
        height={height}
        isDarkMode={theme.isDark}
        className="mt-2 w-full min-w-0"
      />
    </div>
  );
}
