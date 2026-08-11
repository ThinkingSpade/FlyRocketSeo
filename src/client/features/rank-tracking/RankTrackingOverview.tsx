import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Chart } from "@cloudflare/kumo/components/chart";
import { getRankConfigTrend } from "@/serverFunctions/rank-tracking";
import {
  formatDateTick,
  tooltipAxisTime,
  TrendRangeToggle,
} from "./RankTrackingTrendChart";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import { ChartSkeleton } from "@/client/components/chart/ChartSkeleton";

const BUCKETS = [
  { key: "top3", label: "Top 3", color: "#16a34a" },
  { key: "top4to10", label: "4–10", color: "#2563eb" },
  { key: "top11to20", label: "11–20", color: "#f59e0b" },
  { key: "notRanking", label: "Not in top 20", color: "#6b7280" },
] as const;

const CHART_HEIGHT = 220;

export function RankTrackingOverview({
  device,
  projectId,
  configId,
}: {
  device: "desktop" | "mobile";
  projectId: string;
  configId: string;
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

  const theme = useChartTheme();
  const base = useChartBase(theme);

  const options = useMemo(
    () => ({
      ...base,
      tooltip: {
        ...base.tooltip,
        dangerousHtmlFormatter: (params: unknown) => {
          const label = tooltipAxisTime(params);
          if (label === null) return "";
          // Keyed by series name, so a bucket ECharts left out of the hovered
          // params (an empty series) still prints its zero, as the Recharts
          // tooltip did.
          const byName = new Map(
            tooltipRows(params).map((row) => [row.seriesName, row.value ?? 0]),
          );
          const date = new Date(label).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return [
            `<div style="font-size:11px;opacity:0.6">${date}</div>`,
            ...BUCKETS.map(
              (b) =>
                `<div style="display:flex;align-items:center;gap:6px;font-size:12px">` +
                `<span style="width:8px;height:8px;border-radius:2px;background:${b.color}"></span>` +
                `<span style="opacity:0.6">${b.label}:</span>` +
                `<span style="font-weight:500;font-variant-numeric:tabular-nums">${byName.get(b.label) ?? 0}</span>` +
                `</div>`,
            ),
          ].join("");
        },
      },
      xAxis: {
        ...base.axisCommon,
        // A real time scale, as Recharts' `type="number" scale="time"` was.
        type: "time" as const,
        min: "dataMin" as const,
        max: "dataMax" as const,
        // CartesianGrid was horizontal-only (`vertical={false}`).
        splitLine: { show: false },
        axisLabel: {
          ...base.axisCommon.axisLabel,
          formatter: (value: number) => formatDateTick(value),
          // ECharts' own overlap avoidance, in place of Recharts' minTickGap.
          hideOverlap: true,
        },
      },
      yAxis: {
        ...base.axisCommon,
        type: "value" as const,
        // Keyword counts — Recharts' allowDecimals={false}.
        minInterval: 1,
      },
      // One band per bucket, stacked into the tracked total. Every series
      // shares a `stack` id and carries an areaStyle, which is what makes this
      // a stacked area rather than four overlapping lines.
      series: BUCKETS.map((b) => ({
        type: "line" as const,
        name: b.label,
        stack: "total",
        data: chartData.map((row) => [row.checkedAt, row[b.key]]),
        smooth: true,
        symbol: "none" as const,
        showSymbol: false,
        lineStyle: { width: 2, color: b.color },
        itemStyle: { color: b.color },
        areaStyle: { color: b.color, opacity: 0.7 },
      })),
    }),
    [base, chartData],
  );

  return (
    <div className="px-4 pt-4 pb-4">
      <div className="rounded-lg border border-base-300 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Position distribution</span>
          <TrendRangeToggle value={sinceDays} onChange={setSinceDays} />
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {BUCKETS.map((b) => (
            <span
              key={b.key}
              className="inline-flex items-center gap-1 text-[11px] text-base-content/60"
            >
              <span
                className="size-2 rounded-sm"
                style={{ backgroundColor: b.color }}
              />
              {b.label}
            </span>
          ))}
        </div>

        {trendLoading ? (
          // 220 is the chart's own height below, not a guess: a spinner in a
          // p-8 box was two thirds shorter, so the card grew when data landed
          // and everything under it jumped down the page.
          <ChartSkeleton
            height={CHART_HEIGHT}
            label="Loading position distribution"
          />
        ) : chartData.length <= 1 ? (
          <div className="rounded-lg border border-dashed border-base-300 p-8 text-center text-xs text-base-content/60">
            {chartData.length === 0
              ? "No history yet — run a check to start tracking positions over time."
              : "Only 1 check so far — the trend fills in after the next check."}
          </div>
        ) : (
          <Chart
            echarts={echarts}
            options={options}
            height={CHART_HEIGHT}
            isDarkMode={theme.isDark}
            className="w-full min-w-0"
          />
        )}
      </div>
    </div>
  );
}
