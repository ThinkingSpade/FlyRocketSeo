import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import {
  CHART_AXIS_TICK,
  CHART_CURSOR_LINE,
  CHART_X_TICK_GAP,
} from "@/client/components/chart/chartTheme";
import { ChartActiveDot } from "@/client/components/chart/ChartActiveDot";
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

/** Narrowed shape of a recharts tooltip payload entry (typed `any` upstream). */
interface RechartsPayloadEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string | null;
  color?: string;
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
  renderTooltip: (label: number, entries: TooltipEntry[]) => ReactNode;
  /** Show the muted "not in top {serpDepth}" band — only meaningful for a
   * single keyword's position line, not for an averaged value. */
  showBottomBand?: boolean;
}) {
  const { containerRef, width: chartWidth } = useChartWidth();

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-base-content/50">
        <span>Google position (1 = best)</span>
        <span className="inline-flex items-center gap-1">
          Better <span aria-hidden>↑</span>
        </span>
      </div>
      <div ref={containerRef} className="w-full min-w-0" style={{ height }}>
        {chartWidth > 0 ? (
          <LineChart
            width={chartWidth}
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
            {/* Muted bottom band: not in top {serpDepth} */}
            {showBottomBand && (
              <ReferenceArea
                y1={serpDepth - 0.5}
                y2={serpDepth}
                fill="currentColor"
                fillOpacity={0.06}
                ifOverflow="extendDomain"
              />
            )}
            <XAxis
              dataKey="checkedAt"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatDateTick}
              tick={CHART_AXIS_TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={CHART_X_TICK_GAP}
            />
            <YAxis
              reversed
              domain={[1, serpDepth]}
              allowDecimals={false}
              tick={CHART_AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              content={(props: TooltipContentProps<number, string>) => {
                const { active, payload, label } = props;
                if (!active || !payload?.length || typeof label !== "number") {
                  return null;
                }
                const entries: TooltipEntry[] = payload.map(
                  (p: RechartsPayloadEntry) => ({
                    dataKey: p.dataKey,
                    name: p.name,
                    value: typeof p.value === "number" ? p.value : null,
                    color: p.color,
                  }),
                );
                return renderTooltip(label, entries);
              }}
              cursor={CHART_CURSOR_LINE}
            />
            {series.map((s) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.strokeDasharray}
                dot={false}
                activeDot={<ChartActiveDot />}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        ) : null}
      </div>
    </div>
  );
}

export function formatDateTick(value: number): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Responsive chart width via ResizeObserver — recharts needs an explicit px
 * width. Uses a callback ref so it measures whenever the chart node mounts,
 * including after a loading state (an effect-on-mount would miss that and leave
 * the width stuck at 0). Shared by the line chart and the distribution chart. */
export function useChartWidth() {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  return { containerRef, width };
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
