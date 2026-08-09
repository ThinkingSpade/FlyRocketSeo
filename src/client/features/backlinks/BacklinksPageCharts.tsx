import { useMemo } from "react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import {
  formatCompactDate,
  formatMonthLabel,
  formatTooltipValue,
} from "./backlinksPageUtils";

/** Unchanged from the Recharts lines' `stroke` values. */
const BACKLINKS_COLOR = "#2563eb";
const REFERRING_DOMAINS_COLOR = "#14b8a6";
const RANK_COLOR = "#a855f7";
const LOST_COLOR = "#ef4444";
const NEW_COLOR = "#16a34a";

const CHART_HEIGHT = 224;

export function BacklinksTrendChart({
  data,
}: {
  data: BacklinksOverviewData["trends"];
}) {
  const theme = useChartTheme();
  const base = useChartBase(theme);

  const options = useMemo(
    () => ({
      ...base,
      ...legendAndGrid(base, theme, ["Backlinks", "Referring domains"]),
      tooltip: { ...base.tooltip, ...TOOLTIP },
      xAxis: dateAxis(base, data),
      // Two scales, as before: backlinks outnumber referring domains by an
      // order of magnitude, so one shared axis would flatten the second line.
      // Only the left axis draws split lines, or the two sets of gridlines
      // would interleave at unrelated heights.
      yAxis: [
        countAxis(base),
        {
          ...countAxis(base),
          position: "right" as const,
          splitLine: { show: false },
        },
      ],
      series: [
        lineSeries({
          name: "Backlinks",
          color: BACKLINKS_COLOR,
          data: data.map((point) => point.backlinks),
        }),
        lineSeries({
          name: "Referring domains",
          color: REFERRING_DOMAINS_COLOR,
          data: data.map((point) => point.referringDomains),
          yAxisIndex: 1,
        }),
      ],
    }),
    [base, theme, data],
  );

  if (data.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <div className="h-56 min-w-0" aria-label="Backlink trend chart">
      <Chart
        echarts={echarts}
        options={options}
        height={CHART_HEIGHT}
        isDarkMode={theme.isDark}
        className="w-full min-w-0"
      />
    </div>
  );
}

/**
 * Domain Rank over the same twelve months. The `rank` values already ride
 * along on the history call the overview makes, so this chart costs nothing —
 * it was simply never plotted.
 */
export function BacklinksAuthorityChart({
  data,
}: {
  data: BacklinksOverviewData["trends"];
}) {
  const theme = useChartTheme();
  const base = useChartBase(theme);
  // Memoised because it feeds the options below: filtering inline would hand
  // that memo a new array on every render.
  const points = useMemo(
    () => data.filter((point) => point.rank != null),
    [data],
  );

  const options = useMemo(
    () => ({
      ...base,
      ...legendAndGrid(base, theme, ["Domain Rank"]),
      tooltip: { ...base.tooltip, ...TOOLTIP },
      xAxis: dateAxis(base, points),
      yAxis: {
        ...base.axisCommon,
        type: "value" as const,
        // Fixed to the one-hundred rank scale the backlinks calls request, so
        // a flat profile reads as flat instead of being auto-zoomed into
        // looking volatile.
        min: 0,
        max: 100,
      },
      series: [
        lineSeries({
          name: "Domain Rank",
          color: RANK_COLOR,
          data: points.map((point) => point.rank),
        }),
      ],
    }),
    [base, theme, points],
  );

  if (points.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <div className="h-56 min-w-0" aria-label="Domain Rank trend chart">
      <Chart
        echarts={echarts}
        options={options}
        height={CHART_HEIGHT}
        isDarkMode={theme.isDark}
        className="w-full min-w-0"
      />
    </div>
  );
}

export function BacklinksNewLostChart({
  data,
}: {
  data: BacklinksOverviewData["newLostTrends"];
}) {
  const theme = useChartTheme();
  const base = useChartBase(theme);

  const options = useMemo(
    () => ({
      ...base,
      ...legendAndGrid(base, theme, ["Lost backlinks", "New backlinks"]),
      tooltip: { ...base.tooltip, ...TOOLTIP },
      xAxis: dateAxis(base, data),
      yAxis: countAxis(base),
      series: [
        lineSeries({
          name: "Lost backlinks",
          color: LOST_COLOR,
          data: data.map((point) => point.lostBacklinks),
        }),
        lineSeries({
          name: "New backlinks",
          color: NEW_COLOR,
          data: data.map((point) => point.newBacklinks),
        }),
      ],
    }),
    [base, theme, data],
  );

  if (data.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <div className="h-56 min-w-0" aria-label="New and lost backlinks chart">
      <Chart
        echarts={echarts}
        options={options}
        height={CHART_HEIGHT}
        isDarkMode={theme.isDark}
        className="w-full min-w-0"
      />
    </div>
  );
}

type ChartBase = ReturnType<typeof useChartBase>;
type ChartTheme = Parameters<typeof useChartBase>[0];

/**
 * Recharts' `<Legend />` sits under the plot, so the ECharts one does too —
 * and the grid gives back the room it takes, which `containLabel` alone would
 * not do (it accounts for axis labels, not for a legend).
 */
function legendAndGrid(base: ChartBase, theme: ChartTheme, names: string[]) {
  return {
    grid: { ...base.grid, bottom: 24 },
    legend: {
      data: names,
      bottom: 0,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { color: theme.text, fontSize: 12 },
    },
  };
}

/**
 * The shared x-axis: an ISO date per history row, as a CATEGORY rather than a
 * time axis. These rows are one-per-month buckets, and spacing them by real
 * elapsed time would put uneven gaps between months of different lengths.
 */
function dateAxis(base: ChartBase, rows: Array<{ date: string }>) {
  return {
    ...base.axisCommon,
    type: "category" as const,
    data: rows.map((row) => row.date),
    boundaryGap: false,
    axisLabel: {
      ...base.axisCommon.axisLabel,
      formatter: (value: string) => formatChartTick(value),
      // ECharts' own overlap avoidance replaces Recharts' minTickGap: it drops
      // labels that would collide rather than taking a pixel budget.
      hideOverlap: true,
    },
  };
}

function countAxis(base: ChartBase) {
  return {
    ...base.axisCommon,
    type: "value" as const,
    axisLabel: {
      ...base.axisCommon.axisLabel,
      formatter: (value: number) => formatAxisValue(value),
    },
  };
}

function lineSeries(args: {
  name: string;
  color: string;
  data: Array<number | null>;
  yAxisIndex?: number;
}) {
  return {
    type: "line" as const,
    name: args.name,
    data: args.data,
    yAxisIndex: args.yAxisIndex ?? 0,
    smooth: true,
    // `showSymbol: false` rather than `symbol: "none"`: Recharts drew no dots
    // along the line but kept its default hover dot, and only this form keeps
    // the point marker on the hovered value.
    showSymbol: false,
    symbolSize: 6,
    lineStyle: { width: 2, color: args.color },
    itemStyle: { color: args.color },
  };
}

/**
 * The same content Recharts' default tooltip rendered under
 * `formatter`/`labelFormatter`: the full date, then a colour dot, series name
 * and formatted value per line.
 *
 * `dangerousHtmlFormatter`, not `formatter`: Kumo destructures this key out and
 * hands it to ECharts AS `formatter`, overwriting anything passed under that
 * name with undefined. A tooltip that spelled it `formatter` would silently
 * fall back to the ECharts default.
 */
const TOOLTIP = {
  dangerousHtmlFormatter: (params: unknown) => {
    const rows = tooltipRows(params);
    const [first] = rows;
    if (!first) return "";
    return [
      `<div style="font-size:11px;opacity:0.6">${formatChartLabel(first.axisValue)}</div>`,
      ...rows.map(
        (row) =>
          `<div style="display:flex;align-items:center;gap:6px;font-size:12px">` +
          `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${row.color}"></span>` +
          `${row.seriesName}<span style="font-weight:500">${formatTooltipValue(row.value)}</span></div>`,
      ),
    ].join("");
  },
};

function EmptyChartState() {
  return (
    <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-base-300 text-sm text-base-content/55">
      Not enough historical data yet.
    </div>
  );
}

/**
 * Built once — constructing an Intl formatter per tick is the expensive part.
 *
 * One fraction digit is not cosmetic. Rounding thousands to whole K (the old
 * `(value / 1000).toFixed(0)`) collapses any two ticks less than 1,000 apart
 * onto the same label, and ECharts picks 500-unit steps on these axes: the
 * backlinks trend axis read "4K, 3K, 3K, 2K, 2K, 1K, 500, 0", with three
 * duplicated pairs. Round values still print as before — 90000 is "90K", not
 * "90.0K".
 */
const AXIS_NUMBER = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatAxisValue(value: unknown) {
  if (typeof value !== "number") return "";
  return AXIS_NUMBER.format(value);
}

function formatChartTick(value: unknown) {
  return typeof value === "string" ? formatMonthLabel(value) : "";
}

function formatChartLabel(value: unknown) {
  return typeof value === "string" ? formatCompactDate(value) : "";
}
