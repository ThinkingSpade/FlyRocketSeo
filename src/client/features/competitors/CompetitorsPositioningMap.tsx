import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { useChartWidth } from "@/client/features/rank-tracking/RankTrackingTrendChart";
import { getDomainOverview } from "@/serverFunctions/domain";
import type { CompetitorRow } from "@/server/features/competitors/services/CompetitorsService";

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
  const targetQuery = useQuery({
    enabled: target.trim() !== "",
    queryKey: ["domain-overview-bubble", projectId, target],
    queryFn: () =>
      getDomainOverview({ data: { projectId, domain: target.trim() } }),
    staleTime: 30 * 60_000,
    retry: 1,
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

    const overview = targetQuery.data;
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
  }, [rows, targetQuery.data]);

  const { containerRef, width: chartWidth } = useChartWidth();
  const height = 260;
  if (bubbles.length < 2) return null;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-4">
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
                tick={{ fontSize: 10, fill: "#888" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="number"
                dataKey="traffic"
                name="Organic traffic"
                tickFormatter={formatCompact}
                tick={{ fontSize: 10, fill: "#888" }}
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
