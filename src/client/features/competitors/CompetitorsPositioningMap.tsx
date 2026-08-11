import { useMemo } from "react";
import { Map } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { InsightIcon } from "@/client/components/InsightTile";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { useChartWidth } from "@/client/features/rank-tracking/RankTrackingTrendChart";
import type { CompetitorRow, DiscoveryMode } from "@/types/schemas/competitors";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { domainOverviewResultSchema } from "@/types/schemas/domain";
import { CHART_AXIS_TICK } from "@/client/components/chart/chartTheme";
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
const TARGET_COLOR = "#111827";

type Bubble = PositioningMapBubble & { fill: string };

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Recharts types tooltip payloads as any; narrow structurally instead. */
function isBubble(value: unknown): value is Bubble {
  return (
    typeof value === "object" &&
    value !== null &&
    "domain" in value &&
    "keywords" in value &&
    "traffic" in value &&
    "overlap" in value
  );
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

  const { containerRef, width: chartWidth } = useChartWidth();
  const height = 260;
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
            <InsightIcon icon={Map} tone="primary" />
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

  const bubbles = withFill(result.bubbles);

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={Map} tone="primary" />
          Competitive positioning
        </h2>
        <p className="-mt-1 text-xs text-base-content/50">
          Organic keywords vs. estimated traffic — bubble size is keyword
          overlap with {target || "the target"}.
        </p>
        <div ref={containerRef} className="w-full min-w-0" style={{ height }}>
          {chartWidth > 0 ? (
            <ScatterChart
              width={chartWidth}
              height={height}
              margin={{ top: 12, right: 16, bottom: 4, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                opacity={0.1}
              />
              <XAxis
                type="number"
                dataKey="keywords"
                name="Organic keywords"
                tickFormatter={formatCompact}
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="number"
                dataKey="traffic"
                name="Organic traffic"
                tickFormatter={formatCompact}
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <ZAxis
                type="number"
                dataKey="overlap"
                range={[80, 900]}
                name="Shared keywords"
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={(props: TooltipContentProps<number, string>) => {
                  // Same narrowing pattern as the trends tooltip: annotate
                  // the callback param instead of assigning the any[].
                  const candidates = (props.payload ?? []).map(
                    (entry: { payload?: unknown }) => entry.payload,
                  );
                  const payload = candidates[0];
                  if (!props.active || !isBubble(payload)) return null;
                  return (
                    <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs shadow">
                      <div className="pb-1 font-medium">{payload.domain}</div>
                      <div>
                        {formatCompact(payload.keywords)} keywords ·{" "}
                        {formatCompact(payload.traffic)} traffic
                      </div>
                      {payload.isTarget ? null : (
                        <div className="text-base-content/60">
                          {formatCompact(payload.overlap)} shared keywords
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Scatter data={bubbles} isAnimationActive={false}>
                {bubbles.map((bubble) => (
                  <Cell
                    key={bubble.domain}
                    fill={bubble.fill}
                    fillOpacity={bubble.isTarget ? 0.85 : 0.5}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          ) : null}
        </div>
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
