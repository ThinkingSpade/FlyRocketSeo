import { useMemo } from "react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import { getDomainRankHistory } from "@/serverFunctions/domain";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";

const KEYWORDS_COLOR = "#2563eb";

function formatMonth(value: string): string {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function DomainVisibilityTrend({
  projectId,
  domain,
  locationCode,
  languageCode,
}: {
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
}) {
  const trimmedDomain = domain.trim();
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, trimmedDomain, locationCode, languageCode),
  );
  const query = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: trimmedDomain !== "",
    queryKey: [
      "domain-rank-history",
      projectId,
      trimmedDomain,
      locationCode,
      languageCode,
    ],
    queryFn: () =>
      getDomainRankHistory({
        data: {
          projectId,
          domain: trimmedDomain,
          locationCode,
          languageCode,
        },
      }),
  });

  // Memoized because the `?? []` fallback is a new array on every render, which
  // would re-derive the chart options each time.
  const points = useMemo(() => query.data?.points ?? [], [query.data]);
  const theme = useChartTheme();
  const base = useChartBase(theme);
  const height = 220;

  const options = useMemo(
    () => ({
      ...base,
      tooltip: {
        ...base.tooltip,
        formatter: (params: unknown) => {
          const [first] = tooltipRows(params);
          if (!first) return "";
          return [
            `<div style="font-size:11px;font-weight:500">${formatMonth(first.axisValue)}</div>`,
            `<div style="font-size:12px">${(first.value ?? 0).toLocaleString()} keywords</div>`,
          ].join("");
        },
      },
      xAxis: {
        ...base.axisCommon,
        type: "category" as const,
        data: points.map((point) => point.date),
        boundaryGap: false,
        axisLabel: {
          ...base.axisCommon.axisLabel,
          formatter: (value: string) => formatMonth(value),
          // ECharts' own overlap avoidance replaces Recharts' minTickGap: it
          // drops labels that would collide rather than taking a pixel budget.
          hideOverlap: true,
        },
      },
      yAxis: {
        ...base.axisCommon,
        type: "value" as const,
        minInterval: 1,
        axisLabel: {
          ...base.axisCommon.axisLabel,
          formatter: (value: number) => value.toLocaleString(),
        },
      },
      series: [
        {
          type: "line" as const,
          data: points.map((point) => point.organicKeywords),
          smooth: true,
          symbol: "none" as const,
          lineStyle: { width: 2, color: KEYWORDS_COLOR },
          itemStyle: { color: KEYWORDS_COLOR },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${KEYWORDS_COLOR}40` },
                { offset: 1, color: `${KEYWORDS_COLOR}00` },
              ],
            },
          },
        },
      ],
    }),
    [base, points],
  );

  return (
    <div className="border border-base-300 rounded-xl bg-base-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
        <div>
          <h2 className="text-sm font-semibold">Organic Visibility Trend</h2>
          <p className="text-xs text-base-content/50">
            Monthly ranking keywords over time
          </p>
        </div>
        {query.isFetching ? <Loader size="sm" /> : null}
      </div>

      <div className="p-4">
        {!run.authorized ? (
          <div className="py-8 text-center">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => run.authorize()}
            >
              Load visibility trend
            </Button>
          </div>
        ) : query.isFetching && points.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader />
          </div>
        ) : points.length === 0 ? (
          <p className="py-8 text-center text-sm text-base-content/50">
            No historical visibility data available for this domain.
          </p>
        ) : (
          <Chart
            echarts={echarts}
            options={options}
            height={height}
            isDarkMode={theme.isDark}
            className="w-full min-w-0"
          />
        )}
      </div>
    </div>
  );
}
