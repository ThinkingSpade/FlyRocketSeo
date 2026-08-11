import { useMemo } from "react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import { formatCount } from "@/client/features/ai-search/platformLabels";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

type Props = {
  result: BrandLookupResult;
};

export function BrandLookupMentionTrendCard({ result }: Props) {
  const theme = useChartTheme();
  const base = useChartBase(theme);

  const { labels, values } = useMemo(() => {
    const rows = result.monthlyVolume.map((entry) => ({
      label: `${entry.year}-${String(entry.month).padStart(2, "0")}`,
      volume: entry.volume ?? 0,
    }));
    return {
      labels: rows.map((row) => row.label),
      values: rows.map((row) => row.volume),
    };
  }, [result.monthlyVolume]);

  const options = useMemo(
    () => ({
      ...base,
      tooltip: {
        ...base.tooltip,
        // ECharts tooltips are formatted, not rendered — there is no React
        // subtree to hand it. `formatter` returns a string, so the markup that
        // used to be a component is a template here, using the same tokens the
        // rest of the app does so it still matches its surroundings.
        dangerousHtmlFormatter: (params: unknown) => {
          const [first] = tooltipRows(params);
          if (!first) return "";
          return [
            `<div style="font-size:11px;opacity:0.6">${first.axisValue}</div>`,
            `<div style="font-size:13px;font-weight:500">${formatCount(first.value ?? 0)} mentions</div>`,
          ].join("");
        },
      },
      xAxis: {
        ...base.axisCommon,
        // A category axis, not a time axis: these labels are "2026-03" month
        // buckets, not instants, and spacing them by real elapsed time would
        // put uneven gaps between months of different lengths.
        type: "category" as const,
        data: labels,
        boundaryGap: false,
      },
      yAxis: {
        ...base.axisCommon,
        type: "value" as const,
        minInterval: 1,
      },
      series: [
        {
          type: "line" as const,
          data: values,
          smooth: true,
          symbol: "none" as const,
          lineStyle: { width: 2, color: theme.brand },
          itemStyle: { color: theme.brand },
        },
      ],
    }),
    [base, labels, values, theme.brand],
  );

  if (labels.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-base-content/60">
        Not enough historical data yet.
      </div>
    );
  }

  return (
    <Chart
      echarts={echarts}
      options={options}
      height={224}
      isDarkMode={theme.isDark}
    />
  );
}
