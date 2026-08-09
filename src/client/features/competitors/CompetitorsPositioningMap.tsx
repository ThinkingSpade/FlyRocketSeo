import { useMemo } from "react";
// Aliased: the icon is called `Map`, and the tooltip lookup below needs the
// global `Map` constructor.
import { Map as MapIcon } from "lucide-react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { InsightIcon } from "@/client/components/InsightTile";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import type { CompetitorRow } from "@/server/features/competitors/services/CompetitorsService";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { domainOverviewResultSchema } from "@/types/schemas/domain";

// Series palette shared with the trends charts.
const DOT_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
];
const TARGET_COLOR = "#111827";
const MAX_BUBBLES = 8;

/**
 * Recharts' `<ZAxis range>` is an AREA range in square pixels; ECharts'
 * `symbolSize` is a diameter. Same two numbers, converted rather than reused,
 * so the bubbles keep the sizes they had.
 */
const BUBBLE_AREA_MIN = 80;
const BUBBLE_AREA_MAX = 900;

function diameterForArea(area: number): number {
  return 2 * Math.sqrt(area / Math.PI);
}

type Bubble = {
  domain: string;
  keywords: number;
  traffic: number;
  overlap: number;
  isTarget: boolean;
  fill: string;
};

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/** The tooltip is an HTML string rather than a React subtree now, so the
 *  provider-supplied domain has to be escaped by hand — JSX did it before. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Semrush-style competitive positioning map: organic keywords × organic
 * traffic, bubble sized by keyword overlap with the target. The target's own
 * bubble comes from the (server-cached) domain overview.
 */
export function CompetitorsPositioningMap({
  projectId,
  target,
  rows,
}: {
  projectId: string;
  target: string;
  rows: CompetitorRow[];
}) {
  const {
    restored: targetRun,
    isError: targetRunFailed,
    retry: retryTargetRun,
    isRetrying: targetRunRetrying,
  } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.domainOverview,
    schema: domainOverviewResultSchema,
    enabled: target.trim() !== "",
  });

  const bubbles = useMemo<Bubble[]>(() => {
    const competitors = rows
      .filter(
        (row) => row.organicKeywords != null && row.organicTraffic != null,
      )
      .toSorted((a, b) => (b.intersections ?? 0) - (a.intersections ?? 0))
      .slice(0, MAX_BUBBLES)
      .map((row, index) => ({
        domain: row.domain,
        keywords: row.organicKeywords ?? 0,
        traffic: row.organicTraffic ?? 0,
        overlap: row.intersections ?? 0,
        isTarget: false,
        fill: DOT_COLORS[index % DOT_COLORS.length],
      }));

    const overview =
      targetRun?.result.domain === target.trim() ? targetRun.result : null;
    if (
      overview?.hasData &&
      overview.organicKeywords != null &&
      overview.organicTraffic != null
    ) {
      const maxOverlap = Math.max(1, ...competitors.map((c) => c.overlap));
      competitors.push({
        domain: `${overview.domain} (you)`,
        keywords: overview.organicKeywords,
        traffic: overview.organicTraffic,
        overlap: maxOverlap,
        isTarget: true,
        fill: TARGET_COLOR,
      });
    }
    return competitors;
  }, [rows, target, targetRun]);

  const theme = useChartTheme();
  const base = useChartBase(theme);
  const height = 260;

  // One point per bubble, carrying its own colour: this is what `<Cell>` was.
  // A per-point object beats an `itemStyle.color` callback here because the
  // target's bubble differs in opacity as well as hue, and both belong to the
  // point rather than to the series.
  const points = useMemo(() => {
    const overlaps = bubbles.map((bubble) => bubble.overlap);
    const min = Math.min(...overlaps);
    const max = Math.max(...overlaps);
    return bubbles.map((bubble) => {
      // A degenerate domain lands every bubble on the middle of the size
      // range, which is what d3 (and so Recharts) does with min === max.
      const t = max === min ? 0.5 : (bubble.overlap - min) / (max - min);
      return {
        name: bubble.domain,
        value: [bubble.keywords, bubble.traffic],
        symbolSize: diameterForArea(
          BUBBLE_AREA_MIN + t * (BUBBLE_AREA_MAX - BUBBLE_AREA_MIN),
        ),
        itemStyle: {
          color: bubble.fill,
          opacity: bubble.isTarget ? 0.85 : 0.5,
        },
      };
    });
  }, [bubbles]);

  // The tooltip needs the whole bubble, not just the [x, y] pair ECharts hands
  // back, so the point's name indexes into the source rows.
  const byDomain = useMemo(
    () => new Map(bubbles.map((bubble) => [bubble.domain, bubble])),
    [bubbles],
  );

  const options = useMemo(
    () => ({
      ...base,
      tooltip: {
        ...base.tooltip,
        // Points, not categories: with a value x-axis there is no shared axis
        // value to gather a column of series at, and Recharts showed the
        // hovered point too.
        trigger: "item" as const,
        // `dangerousHtmlFormatter`, not `formatter`: Kumo's Chart rewrites the
        // tooltip as `{...rest, formatter: dangerousHtmlFormatter}` before
        // calling setOption, so a plain `formatter` is overwritten with
        // undefined and ECharts' default tooltip shows instead. The name warns
        // about untrusted HTML — hence `escapeHtml` on the one value that comes
        // from the provider.
        dangerousHtmlFormatter: (params: unknown) => {
          const [first] = tooltipRows(params);
          if (!first) return "";
          const bubble = byDomain.get(first.axisValue);
          if (!bubble) return "";
          return [
            `<div style="font-size:12px;font-weight:500;padding-bottom:2px">${escapeHtml(bubble.domain)}</div>`,
            `<div style="font-size:12px">${formatCompact(bubble.keywords)} keywords · ${formatCompact(bubble.traffic)} traffic</div>`,
            bubble.isTarget
              ? ""
              : `<div style="font-size:12px;opacity:0.6">${formatCompact(bubble.overlap)} shared keywords</div>`,
          ].join("");
        },
      },
      xAxis: {
        ...base.axisCommon,
        type: "value" as const,
        axisLabel: {
          ...base.axisCommon.axisLabel,
          formatter: (value: number) => formatCompact(value),
        },
      },
      yAxis: {
        ...base.axisCommon,
        type: "value" as const,
        axisLabel: {
          ...base.axisCommon.axisLabel,
          formatter: (value: number) => formatCompact(value),
        },
      },
      series: [
        {
          type: "scatter" as const,
          name: "Competitors",
          data: points,
          animation: false,
        },
      ],
    }),
    [base, byDomain, points],
  );

  if (targetRunFailed) {
    return (
      <InlineQueryError
        message="The positioning map could not restore the domain overview."
        retrying={targetRunRetrying}
        onRetry={retryTargetRun}
      />
    );
  }
  if (bubbles.length < 2) return null;

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={MapIcon} tone="primary" />
          Competitive positioning
        </h2>
        <p className="-mt-1 text-xs text-base-content/50">
          Organic keywords vs. estimated traffic — bubble size is keyword
          overlap with {target || "the target"}.
        </p>
        <Chart
          echarts={echarts}
          options={options}
          height={height}
          isDarkMode={theme.isDark}
          className="w-full min-w-0"
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/70">
          {bubbles.map((bubble) => (
            <span key={bubble.domain} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: bubble.fill }}
              />
              <span className={bubble.isTarget ? "font-semibold" : ""}>
                {bubble.domain}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
