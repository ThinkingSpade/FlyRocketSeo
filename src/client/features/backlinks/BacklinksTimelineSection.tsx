import { useMemo } from "react";
import { CalendarBlank } from "@phosphor-icons/react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { Empty } from "@cloudflare/kumo/components/empty";
import { InsightIcon } from "@/client/components/InsightTile";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import { getBacklinksTimeline } from "@/serverFunctions/backlinks";
import { useMeteredQuery } from "@/client/lib/useMeteredQuery";
import { Loader } from "@cloudflare/kumo/components/loader";
import {
  classifyNumericSeries,
  type NumericSeriesInformation,
} from "./backlinksChartInformation";

const GAINED_COLOR = "#16a34a";
const LOST_COLOR = "#dc2626";
const TOTAL_COLOR = "#2563eb";

type TimelineRow = {
  label: string;
  gained: number | null;
  /** Negative for the diverging bar. */
  lostNegative: number | null;
  lost: number | null;
  referringDomains: number | null;
};

function monthLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/** Won vs lost referring domains per month, with the cumulative line. */
export function BacklinksTimelineSection({
  projectId,
  target,
  authorized,
  runNonce,
}: {
  projectId: string;
  target: string;
  authorized: boolean;
  runNonce: number;
}) {
  const timelineQuery = useMeteredQuery({
    authorized,
    runNonce,
    enabled: target.trim() !== "",
    queryKey: ["backlinks-timeline", projectId, target],
    queryFn: () => getBacklinksTimeline({ data: { projectId, target } }),
  });

  const theme = useChartTheme();
  const base = useChartBase(theme);
  const height = 220;

  // Memoized because the `?? []` fallback is a new array on every render, which
  // would re-derive the rows and the chart options each time.
  const points = useMemo(
    () => timelineQuery.data?.points ?? [],
    [timelineQuery.data],
  );

  const rows = useMemo<TimelineRow[]>(
    () =>
      points.map((point) => ({
        label: monthLabel(point.date),
        gained: point.newReferringDomains,
        lostNegative:
          point.lostReferringDomains == null
            ? null
            : -point.lostReferringDomains,
        lost: point.lostReferringDomains,
        referringDomains: point.referringDomains,
      })),
    [points],
  );

  const gainedInformation = classifyNumericSeries(
    rows.map((row) => row.gained),
  );
  const lostInformation = classifyNumericSeries(rows.map((row) => row.lost));
  const totalInformation = classifyNumericSeries(
    rows.map((row) => row.referringDomains),
  );
  const hasRecordedActivity =
    isActivitySeries(gainedInformation) || isActivitySeries(lostInformation);
  const eventsComplete = rows.every(
    (row) => row.gained != null && row.lost != null,
  );
  const emptyPresentation =
    gainedInformation.kind === "all-null" &&
    lostInformation.kind === "all-null" &&
    totalInformation.kind !== "varying"
      ? {
          title:
            "Historical referring-domain gains and losses weren’t reported.",
          description: undefined,
        }
      : !hasRecordedActivity &&
          totalInformation.kind !== "varying" &&
          (gainedInformation.kind === "insufficient" ||
            lostInformation.kind === "insufficient")
        ? {
            title: "Not enough history",
            description:
              "At least 2 reported monthly values are needed. Missing values remain unknown.",
          }
        : !hasRecordedActivity && totalInformation.kind !== "varying"
          ? {
              title: eventsComplete
                ? "No referring-domain gains or losses were recorded in this period."
                : "Historical referring-domain gains and losses weren’t reported for every month.",
              description: undefined,
            }
          : null;

  const options = useMemo(
    () => ({
      ...base,
      tooltip: {
        ...base.tooltip,
        // Recharts drew a translucent band under the hovered category; the
        // ECharts equivalent is the shadow axis pointer, tinted with the same
        // token instead of zrender's default grey.
        axisPointer: {
          type: "shadow" as const,
          shadowStyle: { color: theme.text, opacity: 0.08 },
        },
        // ECharts tooltips are formatted, not rendered — there is no React
        // subtree to hand it, so the markup that used to be a component is a
        // template. `var(...)` works here where it cannot in a series colour:
        // this string becomes DOM inside the themed tree, so the BROWSER
        // resolves the token per theme.
        //
        // `dangerousHtmlFormatter`, not `formatter`: Kumo's Chart rewrites the
        // tooltip as `{...rest, formatter: dangerousHtmlFormatter}` before
        // calling setOption, so anything passed as `formatter` is overwritten
        // with undefined and the chart silently falls back to ECharts' default
        // tooltip. The name is a warning about interpolating untrusted HTML;
        // every value below is our own markup around our own numbers.
        dangerousHtmlFormatter: (params: unknown) => {
          const [first] = tooltipRows(params);
          if (!first) return "";
          // The axis carries the month label, so it identifies the row the way
          // Recharts' payload used to.
          const row = rows.find(
            (candidate) => candidate.label === first.axisValue,
          );
          if (!row) return "";
          return [
            `<div style="font-size:12px;font-weight:500;padding-bottom:2px">${row.label}</div>`,
            `<div style="font-size:12px;color:var(--color-success)">${row.gained == null ? "Not reported" : `+${row.gained}`} won</div>`,
            `<div style="font-size:12px;color:var(--color-error)">${row.lost == null ? "Not reported" : `−${row.lost}`} lost</div>`,
            row.referringDomains == null
              ? ""
              : `<div style="font-size:12px;opacity:0.6">${row.referringDomains.toLocaleString()} referring domains total</div>`,
          ].join("");
        },
      },
      xAxis: {
        ...base.axisCommon,
        type: "category" as const,
        data: rows.map((row) => row.label),
        // The Recharts grid was horizontal-only (`vertical={false}`).
        splitLine: { show: false },
      },
      // Two scales on one grid: the diverging bars are monthly deltas, the line
      // is the running total, and sharing an axis would flatten the deltas to
      // nothing. The second entry is what `yAxisId="total"` was.
      yAxis: [
        {
          ...base.axisCommon,
          type: "value" as const,
          minInterval: 1,
        },
        {
          ...base.axisCommon,
          type: "value" as const,
          minInterval: 1,
          position: "right" as const,
          // Only the left axis draws grid lines, or the two sets of ticks
          // would cross-hatch the plot.
          splitLine: { show: false },
        },
      ],
      series: [
        // One `stack` id with signed values is Recharts' `stackOffset="sign"`:
        // ECharts stacks positives up from zero and negatives down.
        {
          type: "bar" as const,
          name: "Won",
          stack: "delta",
          data: rows.map((row) => row.gained),
          itemStyle: { color: GAINED_COLOR, opacity: 0.75 },
          animation: false,
        },
        {
          type: "bar" as const,
          name: "Lost",
          stack: "delta",
          data: rows.map((row) => row.lostNegative),
          itemStyle: { color: LOST_COLOR, opacity: 0.65 },
          animation: false,
        },
        {
          type: "line" as const,
          name: "Referring domains",
          yAxisIndex: 1,
          data: rows.map((row) => row.referringDomains),
          smooth: true,
          symbol: "none" as const,
          connectNulls: false,
          lineStyle: { width: 2, color: TOTAL_COLOR },
          itemStyle: { color: TOTAL_COLOR },
          animation: false,
        },
      ],
    }),
    [base, rows, theme.text],
  );

  return (
    <section className="rounded-xl border border-base-300 bg-base-100 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <InsightIcon icon={CalendarBlank} tone="primary" />
        Referring domains — won vs lost
      </h2>
      <p className="mt-0.5 text-xs text-base-content/50">
        Monthly gains (green) and losses (red) over the last year, with total
        referring domains as the line.
      </p>
      {timelineQuery.data ? (
        <p className="mt-1 text-xs text-base-content/50">
          DataForSEO backlink index · Captured{" "}
          {timelineQuery.data.fetchedAt.slice(0, 10)} (UTC). Missing values
          remain unknown.
        </p>
      ) : null}
      {timelineQuery.isPending ? (
        <div className="flex items-center justify-center py-14">
          <Loader size="sm" />
        </div>
      ) : timelineQuery.isError ? (
        <InlineQueryError
          className="mt-3"
          message="The backlink timeline could not be loaded."
          retrying={timelineQuery.isFetching}
          retryLabel="Retry (uses credits)"
          onRetry={() => void timelineQuery.refetch()}
        />
      ) : emptyPresentation ? (
        <Empty
          size="sm"
          className="mt-3 h-[220px] rounded-none border-0 bg-transparent"
          title={emptyPresentation.title}
          description={emptyPresentation.description}
        />
      ) : (
        <Chart
          echarts={echarts}
          options={options}
          height={height}
          isDarkMode={theme.isDark}
          className="mt-3 w-full min-w-0"
        />
      )}
    </section>
  );
}

function isActivitySeries(information: NumericSeriesInformation) {
  return information.kind === "varying" || information.kind === "constant";
}
