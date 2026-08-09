import { useMemo } from "react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";

export interface TrendSeries {
  /** key into each data row holding the position value (1 = best, serpDepth = bottom band) */
  dataKey: string;
  name: string;
  color: string;
  /** dashed = device line where nulls are plotted in the bottom "not in top N" band */
  strokeDasharray?: string;
}

interface TooltipEntry {
  dataKey?: string | number;
  name?: string;
  value: number | null;
  color?: string;
}

/** Read a numeric field off an untyped chart row. The rows are
 *  `Record<string, unknown>` because the caller pivots device keys into them,
 *  and the lint config forbids asserting the read back into a number. */
function numberAt(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

/** Recharts took `strokeDasharray="4 3"`; ECharts takes the same pattern as a
 *  number array on `lineStyle.type`. */
function dashPattern(value: string | undefined): number[] | undefined {
  if (value == null) return undefined;
  const parts = value
    .split(/[\s,]+/)
    .map(Number)
    .filter(Number.isFinite);
  return parts.length > 0 ? parts : undefined;
}

/**
 * Shared inverted-axis line chart for rank trends. Y-axis is reversed so #1 is
 * pinned at the top and an improving line moves up. The very bottom of the
 * plot (= serpDepth) is a muted "Not in top {serpDepth}" band; callers plot
 * null positions at `serpDepth` so a drop reads as the line dipping into the
 * band rather than a silent gap.
 */
export function RankTrendChart({
  data,
  series,
  serpDepth,
  height = 224,
  renderTooltip,
  showBottomBand = false,
}: {
  data: Array<Record<string, unknown>>;
  series: TrendSeries[];
  serpDepth: number;
  height?: number;
  /** Returns the tooltip's inner HTML. ECharts formats tooltips rather than
   *  rendering them, so this hands back a string, not a React subtree. */
  renderTooltip: (label: number, entries: TooltipEntry[]) => string;
  /** Show the muted "not in top {serpDepth}" band — only meaningful for a
   * single keyword's position line, not for an averaged value. */
  showBottomBand?: boolean;
}) {
  const theme = useChartTheme();
  const base = useChartBase(theme);

  const options = useMemo(() => {
    // Rows without a usable timestamp cannot be placed on a time axis at all,
    // so they are dropped here rather than plotted at NaN.
    const rows = data.flatMap((row) => {
      const checkedAt = numberAt(row, "checkedAt");
      return checkedAt === null ? [] : [{ checkedAt, row }];
    });

    // The muted band across the bottom of the plot, replacing Recharts'
    // ReferenceArea. Annotated rather than inferred because ECharts types a 2D
    // mark area as a fixed [start, end] tuple, and an array literal widens to
    // a plain array without the annotation.
    const bandData: Array<[{ yAxis: number }, { yAxis: number }]> = [
      [{ yAxis: serpDepth - 0.5 }, { yAxis: serpDepth }],
    ];

    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        dangerousHtmlFormatter: (params: unknown) => {
          const label = tooltipAxisTime(params);
          if (label === null) return "";
          const entries = tooltipRows(params).map((row) => ({
            // ECharts carries the series NAME through its params, not the key
            // the caller indexed rows by, so the key is recovered from the
            // series definition — callers key their tooltips off `dataKey`.
            dataKey: series.find((s) => s.name === row.seriesName)?.dataKey,
            name: row.seriesName,
            value: row.value,
            color: row.color,
          }));
          if (entries.length === 0) return "";
          return renderTooltip(label, entries);
        },
      },
      xAxis: {
        ...base.axisCommon,
        // A real time scale, as Recharts' `type="number" scale="time"` was:
        // checks are instants, and an uneven gap between them should show as an
        // uneven gap on the axis. dataMin/dataMax keeps ECharts from padding
        // out to round boundaries the way it would by default.
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
        // The whole point of this chart: #1 sits at the TOP and an improving
        // line moves UP. Dropping this silently inverts the chart's meaning.
        inverse: true,
        min: 1,
        max: serpDepth,
        // Positions are integers — Recharts' allowDecimals={false}.
        minInterval: 1,
      },
      series: series.map((s, index) => ({
        type: "line" as const,
        name: s.name,
        data: rows.map((entry) => [
          entry.checkedAt,
          numberAt(entry.row, s.dataKey),
        ]),
        smooth: true,
        // No dot per point, but a hollow ring on the hovered one: surface fill,
        // series colour on the border. The marker the Recharts charts drew for
        // their hovered point, expressed as an emphasis style, not a component.
        symbol: "circle" as const,
        symbolSize: 8,
        showSymbol: false,
        connectNulls: false,
        lineStyle: {
          width: 2,
          color: s.color,
          type: dashPattern(s.strokeDasharray),
        },
        itemStyle: { color: s.color },
        emphasis: {
          itemStyle: {
            color: theme.surface,
            borderColor: s.color,
            borderWidth: 2,
          },
        },
        // Attached to the first series only — one band, not one per line,
        // otherwise the fills stack and the band darkens with each device.
        markArea:
          index === 0 && showBottomBand
            ? {
                silent: true,
                itemStyle: { color: theme.text, opacity: 0.06 },
                label: { show: false },
                data: bandData,
              }
            : undefined,
      })),
    };
  }, [
    base,
    data,
    series,
    serpDepth,
    showBottomBand,
    renderTooltip,
    theme.surface,
    theme.text,
  ]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-base-content/50">
        <span>Google position (1 = best)</span>
        <span className="inline-flex items-center gap-1">
          Better <span aria-hidden>↑</span>
        </span>
      </div>
      <Chart
        echarts={echarts}
        options={options}
        height={height}
        isDarkMode={theme.isDark}
        className="w-full min-w-0"
      />
    </div>
  );
}

export function formatDateTick(value: number): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** `Array.isArray` narrows to `any[]`, which the lint config rejects on the
 *  next member access. This narrows to `unknown[]` instead. */
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * The hovered point's x value, for the two rank charts on a TIME axis.
 *
 * `tooltipRows` types `axisValue` as a string because every other chart in the
 * app sits on a category axis, where that is what ECharts hands over. On a time
 * axis it passes the raw millisecond number instead, which that helper drops —
 * and both of these tooltips need it, one to date the heading and one to look
 * up whether the point was plotted in the bottom band.
 */
export function tooltipAxisTime(params: unknown): number | null {
  const [first] = isUnknownArray(params) ? params : [params];
  if (typeof first !== "object" || first === null) return null;
  if ("axisValue" in first && typeof first.axisValue === "number") {
    return first.axisValue;
  }
  // Fallback: the x half of the [timestamp, value] pair the series carries.
  if ("value" in first && isUnknownArray(first.value)) {
    const [x] = first.value;
    if (typeof x === "number") return x;
  }
  return null;
}

/** 30d / 90d / All range toggle shared by the modal and overview charts. */
const TREND_RANGES = [
  { label: "30d", sinceDays: 30 },
  { label: "90d", sinceDays: 90 },
  { label: "All", sinceDays: 730 },
] as const;

export function TrendRangeToggle({
  value,
  onChange,
}: {
  value: number;
  onChange: (sinceDays: number) => void;
}) {
  return (
    <SegmentedToggle
      showLabels
      // Kumo's Tabs key on strings, and `sinceDays` is a number. Round-tripping
      // through the label rather than String(sinceDays) keeps the mapping in
      // one place — the labels are already unique, and TREND_RANGES stays the
      // single source of which day counts exist.
      items={TREND_RANGES.map((range) => ({
        value: range.label,
        label: range.label,
      }))}
      value={
        TREND_RANGES.find((range) => range.sinceDays === value)?.label ?? "All"
      }
      onChange={(label) => {
        const range = TREND_RANGES.find((r) => r.label === label);
        if (range) onChange(range.sinceDays);
      }}
    />
  );
}
