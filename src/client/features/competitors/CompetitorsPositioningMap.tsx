import { useMemo } from "react";
// Aliased: the icon is called `Map`, and the tooltip lookup below needs the
// global `Map` constructor.
import { MapTrifold as MapIcon } from "@phosphor-icons/react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { InsightIcon } from "@/client/components/InsightTile";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { echarts } from "@/client/components/chart/echarts";
import { escapeHtml } from "@/client/components/chart/tooltipHtml";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import type { CompetitorRow, DiscoveryMode } from "@/types/schemas/competitors";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { domainOverviewResultSchema } from "@/types/schemas/domain";
import {
  buildPositioningMapBubbles,
  type PositioningMapBubble,
} from "./buildPositioningMapBubbles";

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
/**
 * The target's bubble is the one that has to read as "you", so it takes the
 * highest-contrast colour on the surface rather than a palette hue. It used to
 * be a fixed gray-900, which is invisible on the dark theme's near-black panel
 * — the one bubble that must stand out was the only one that did not.
 *
 * A token, because the only place this string is used is the legend swatch,
 * which is a real DOM node. The chart takes the resolved `theme.text` instead;
 * ECharts cannot read a CSS variable.
 */
const TARGET_COLOR = "var(--color-base-content)";

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

type Bubble = PositioningMapBubble & { fill: string };

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Assigns render-only fill colors -- the target's bubble is always last (see
 *  buildPositioningMapBubbles) and gets the sentinel color; every rival keeps
 *  the same palette index it would have had before the target was appended. */
function withFill(bubbles: PositioningMapBubble[]): Bubble[] {
  return bubbles.map((bubble, index) => ({
    ...bubble,
    fill: bubble.isTarget
      ? TARGET_COLOR
      : DOT_COLORS[index % DOT_COLORS.length],
  }));
}

/**
 * Semrush-style competitive positioning map: organic keywords × organic
 * traffic, bubble sized by keyword overlap with the target. The target's own
 * bubble comes from the (server-cached) domain overview.
 *
 * Domain-mode discovery only -- see `buildPositioningMapBubbles`'s own doc
 * comment for why a keyword-seeded (serp-mode) run cannot be plotted on these
 * same axes honestly.
 */
export function CompetitorsPositioningMap({
  projectId,
  target,
  rows,
  discoveryMode,
}: {
  projectId: string;
  target: string;
  rows: CompetitorRow[];
  discoveryMode: DiscoveryMode;
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
    // Serp-mode discovery never renders this chart (see the `unavailable`
    // branch below), so there is nothing to restore this bubble data for --
    // skip the free-but-pointless fetch entirely rather than let it resolve
    // and go unused on every serp-mode render.
    enabled: discoveryMode === "domain" && target.trim() !== "",
  });

  const overview = useMemo(
    () =>
      targetRun?.result.domain === target.trim() ? targetRun.result : null,
    [targetRun, target],
  );

  const result = useMemo(
    () => buildPositioningMapBubbles({ rows, discoveryMode, overview }),
    [rows, discoveryMode, overview],
  );

  // Derived up here, not after the `result.kind` guards below: the chart memos
  // read it, and a hook cannot sit behind an early return. The non-chart kinds
  // yield an empty list, which those memos handle and never render.
  const bubbles = useMemo(
    () => (result.kind === "chart" ? withFill(result.bubbles) : []),
    [result],
  );

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
          color: bubble.isTarget ? theme.text : bubble.fill,
          opacity: bubble.isTarget ? 0.85 : 0.5,
        },
      };
    });
  }, [bubbles, theme.text]);

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

  if (result.kind === "unavailable") {
    return (
      <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
        <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <InsightIcon icon={MapIcon} tone="primary" />
            Competitive positioning
          </h2>
          <p className="text-xs text-base-content/60">
            This chart compares site-wide organic keywords and traffic, which a
            keyword-seeded run like this one doesn&apos;t measure -- it only
            knows how each rival performs on your own tracked keywords. See the
            &quot;Beats you on&quot; and &quot;Coverage&quot; columns in the
            table below instead.
          </p>
        </div>
      </div>
    );
  }

  if (result.kind === "insufficient") return null;

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
