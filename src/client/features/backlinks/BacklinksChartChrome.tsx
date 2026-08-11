import { useEffect, useRef, useState } from "react";
import type { TooltipContentProps } from "recharts";
import { Empty } from "@cloudflare/kumo/components/empty";
import type { NumericSeriesInformation } from "./backlinksChartInformation";
import {
  formatCompactDate,
  formatMonthLabel,
  formatTooltipValue,
} from "./backlinksPageUtils";

/**
 * Shared chrome for the backlinks charts: sizing, the empty states that stand
 * in for uninformative series, and the tokenized tooltip and legend. Split out
 * of BacklinksPageCharts to keep both files under the repo line limit.
 */

export function useChartWidth() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateWidth = () => {
      setChartWidth(container.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { containerRef, chartWidth };
}

export function EmptyChartState({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  const insufficientHistory = title == null;

  return (
    <Empty
      size="sm"
      className="h-56 rounded-none border-0 bg-transparent"
      title={title ?? "Not enough history"}
      description={
        description ??
        (insufficientHistory
          ? "At least 2 monthly snapshots are needed."
          : undefined)
      }
    />
  );
}

type SeriesInformation = NumericSeriesInformation;

export function isStableSeries(information: SeriesInformation) {
  return information.kind === "all-zero" || information.kind === "constant";
}

export function isActivitySeries(information: SeriesInformation) {
  return information.kind === "varying" || information.kind === "constant";
}

/** Recharts types tooltip payload entries as `any`; narrow structurally. */
type TooltipEntry = {
  value: number;
  name?: string;
  dataKey?: string | number;
  color?: string;
};

function isTooltipEntry(entry: unknown): entry is TooltipEntry {
  return (
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as { value?: unknown }).value === "number"
  );
}

export function ChartTooltip(props: TooltipContentProps<number, string>) {
  const entries: TooltipEntry[] = (props.payload ?? []).filter(isTooltipEntry);
  if (!props.active || entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs shadow">
      <div className="pb-1 font-medium">{formatChartLabel(props.label)}</div>
      {entries.map((entry) => (
        <div
          key={String(entry.dataKey ?? entry.name)}
          className="flex items-center gap-1.5"
        >
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-base-content/60">{entry.name}:</span>{" "}
          <span className="tabular-nums">
            {formatTooltipValue(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChartLegend({
  payload,
}: {
  payload?: ReadonlyArray<{
    color?: string;
    dataKey?: string | number;
    value?: string | number;
  }>;
}) {
  if (!payload?.length) return null;

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1 text-xs text-base-content/60">
      {payload.map((entry) => (
        <div
          key={String(entry.dataKey ?? entry.value)}
          className="flex items-center gap-1.5"
        >
          <span
            className="inline-block h-0.5 w-3"
            style={{
              backgroundColor: entry.color,
              opacity: entry.dataKey === "referringDomains" ? 0.55 : 1,
            }}
          />
          {entry.value}
        </div>
      ))}
    </div>
  );
}

export function formatAxisValue(value: unknown) {
  if (typeof value !== "number") return "";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

export function formatChartTick(value: unknown) {
  return typeof value === "string" ? formatMonthLabel(value) : "";
}

function formatChartLabel(value: unknown) {
  return typeof value === "string" ? formatCompactDate(value) : "";
}
