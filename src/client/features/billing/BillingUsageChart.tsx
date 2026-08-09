import { useAggregateEvents } from "autumn-js/react";
import { useMemo } from "react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  autumnSeoDataCreditsToUsd,
} from "@/shared/billing";

const BILLING_USAGE_FEATURE_IDS: string[] = [
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
];

/** Unchanged from the Recharts bar's `fill`. */

export function BillingUsageChart() {
  const theme = useChartTheme();
  const base = useChartBase(theme);

  const eventsQuery = useAggregateEvents({
    featureId: BILLING_USAGE_FEATURE_IDS,
    range: "30d",
    binSize: "day",
  });

  // `eventsQuery.list` is undefined until the first response lands, so the
  // fallback lives inside the memo -- `?? []` in the dependency list would be a
  // fresh array on every render and re-derive the options each time.
  const rows = eventsQuery.list;
  const { labels, values } = useMemo(() => {
    const list = rows ?? [];
    return {
      // The bin's day, pre-formatted: the axis tick and the tooltip heading
      // asked for the same "Aug 9" shape, so the category value IS the label
      // and neither has to re-parse the timestamp.
      labels: list.map((row) => formatShortDate(row.period)),
      values: list.map((row) =>
        autumnSeoDataCreditsToUsd(
          BILLING_USAGE_FEATURE_IDS.reduce(
            (sum, featureId) => sum + (row.values?.[featureId] ?? 0),
            0,
          ),
        ),
      ),
    };
  }, [rows]);

  const totalSpend = values.reduce((sum, value) => sum + value, 0);

  const options = useMemo(
    () => ({
      ...base,
      tooltip: {
        ...base.tooltip,
        // Recharts' bar cursor: a filled band behind the hovered bar, rather
        // than the crosshair a line chart gets.
        axisPointer: { type: "shadow" as const },
        // `dangerousHtmlFormatter`, not `formatter`: Kumo destructures this key
        // out and hands it to ECharts AS `formatter`, overwriting anything
        // passed under that name with undefined. A tooltip that spelled it
        // `formatter` would silently fall back to the ECharts default.
        dangerousHtmlFormatter: (params: unknown) => {
          const [first] = tooltipRows(params);
          if (!first) return "";
          return [
            `<div style="font-size:11px;opacity:0.6">${first.axisValue}</div>`,
            `<div style="font-size:13px;font-weight:500">$${(first.value ?? 0).toFixed(2)}</div>`,
          ].join("");
        },
      },
      xAxis: {
        ...base.axisCommon,
        // Category, not time: these are daily bins already collapsed to a
        // label, and `boundaryGap` (left at its default for a bar series) is
        // what centres each bar in its own band.
        type: "category" as const,
        data: labels,
        axisLabel: {
          ...base.axisCommon.axisLabel,
          // ECharts' own overlap avoidance replaces Recharts' minTickGap: it
          // drops labels that would collide rather than taking a pixel budget.
          hideOverlap: true,
        },
      },
      yAxis: {
        ...base.axisCommon,
        type: "value" as const,
        axisLabel: {
          ...base.axisCommon.axisLabel,
          formatter: (value: number) => formatUsdAxis(value),
        },
      },
      series: [
        {
          type: "bar" as const,
          data: values,
          barMaxWidth: 12,
          // Single-series, so it takes the brand accent rather than a hue of
          // its own — theme.brand resolves --color-primary.
          itemStyle: { color: theme.brand, borderRadius: [2, 2, 0, 0] },
        },
      ],
    }),
    [base, labels, values, theme.brand],
  );

  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">Usage</span>
        <span className="text-xs text-base-content/50">Last 30 days</span>
      </div>

      <div className="text-2xl font-semibold tabular-nums">
        ${totalSpend.toFixed(2)}
      </div>

      <div className="w-full h-32 min-w-0">
        {eventsQuery.isLoading ? null : labels.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-base-content/40">
              No usage recorded yet
            </span>
          </div>
        ) : (
          <Chart
            echarts={echarts}
            options={options}
            height={128}
            isDarkMode={theme.isDark}
            className="w-full min-w-0"
          />
        )}
      </div>
    </div>
  );
}

function formatShortDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatUsdAxis(value: number) {
  return `$${value % 1 === 0 ? value : value.toFixed(2)}`;
}
