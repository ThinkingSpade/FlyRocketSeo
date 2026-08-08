/**
 * The 12-month search-volume area chart, deliberately kept OUT of this
 * folder's barrel (`components/index.ts`).
 *
 * It used to live in `DisplayPrimitives.tsx`, which the barrel re-exports --
 * and `KeywordUi.tsx` re-exported it a second time. The charting library is a
 * static import, so every module that touched the barrel for something trivial
 * dragged the whole library into the shared graph with it. The barrel's real
 * consumers are things like `client/components/table/SortableHeader.tsx`, the
 * backlinks tables and the domain tables, all of which want only
 * `HeaderHelpLabel` or `IntentBadge` -- so the charting library landed in the
 * CLIENT ENTRY chunk and was downloaded and parsed by every visitor on every
 * route, including sign-in.
 *
 * This matters MORE since the move to ECharts, not less: recharts was 195 KB
 * and the registered ECharts build is larger still.
 *
 * This is the same barrel-drag that made the dataforseo SDK unremovable from
 * the Worker startup chunk until `dataforseo/index.ts` stopped re-exporting
 * its SDK-carrying fetchers (see scripts/assert-startup-clean.mjs). The rule
 * that generalises: a barrel is a static dependency edge from EVERY importer
 * to EVERY re-exported module, so nothing behind one may statically import a
 * heavy leaf library.
 *
 * Import this module directly (`./AreaTrendChart`), never via the barrel, and
 * keep the charting library out of anything the barrel can reach.
 */
import { useMemo } from "react";
import { sortBy } from "remeda";
import { Chart } from "@cloudflare/kumo/components/chart";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import type { MonthlySearch } from "@/types/keywords";
import { formatCompactNumber } from "../utils";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function AreaTrendChart({ trend }: { trend: MonthlySearch[] }) {
  const theme = useChartTheme();
  const base = useChartBase(theme);

  const { months, values, fullLabels } = useMemo(() => {
    const last12 = sortBy(trend, (item) => item.year * 100 + item.month).slice(
      -12,
    );
    return {
      months: last12.map((m) => MONTH_LABELS[m.month - 1]),
      values: last12.map((m) => m.searchVolume),
      fullLabels: last12.map((m) => `${MONTH_LABELS[m.month - 1]} ${m.year}`),
    };
  }, [trend]);

  const options = useMemo(
    () => ({
      ...base,
      tooltip: {
        ...base.tooltip,
        formatter: (params: unknown) => {
          const [first] = tooltipRows(params);
          if (!first) return "";
          // The axis shows the bare month; the tooltip is where the year fits,
          // which is why the full label is carried separately.
          const index = months.indexOf(first.axisValue);
          const heading = index === -1 ? first.axisValue : fullLabels[index];
          return [
            `<div style="font-size:11px;opacity:0.6">${heading}</div>`,
            `<div style="font-size:13px;font-weight:500">${formatCompactNumber(first.value ?? 0)}</div>`,
          ].join("");
        },
      },
      xAxis: {
        ...base.axisCommon,
        type: "category" as const,
        data: months,
        boundaryGap: false,
        axisLabel: { ...base.axisCommon.axisLabel, fontSize: 11 },
      },
      yAxis: {
        ...base.axisCommon,
        type: "value" as const,
        axisLabel: {
          ...base.axisCommon.axisLabel,
          fontSize: 11,
          formatter: (value: number) => formatCompactNumber(value),
        },
      },
      series: [
        {
          type: "line" as const,
          name: "Search volume",
          data: values,
          smooth: true,
          symbol: "none" as const,
          lineStyle: { width: 2, color: theme.brand },
          itemStyle: { color: theme.brand },
          // The plain-object gradient form, rather than
          // echarts.graphic.LinearGradient — it needs no extra import and
          // survives tree-shaking unchanged.
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: theme.brandFillStart },
                { offset: 1, color: theme.brandFillEnd },
              ],
            },
          },
        },
      ],
    }),
    [
      base,
      months,
      values,
      fullLabels,
      theme.brand,
      theme.brandFillStart,
      theme.brandFillEnd,
    ],
  );

  if (months.length === 0) return null;

  return (
    <Chart
      echarts={echarts}
      options={options}
      height={210}
      isDarkMode={theme.isDark}
      className="w-full min-w-0"
    />
  );
}
