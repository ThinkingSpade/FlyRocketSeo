import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { Tooltip, Treemap } from "recharts";
import type { TooltipContentProps } from "recharts";
import { InsightIcon } from "@/client/components/InsightTile";
import { useChartWidth } from "@/client/features/rank-tracking/RankTrackingTrendChart";
import {
  buildPagesTreemapData,
  type TreemapDatum,
} from "@/client/features/domain/pagesTreemap";

// Shared chart palette (same hexes as the trends/positioning charts).
const CELL_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#7c3aed",
  "#ea580c",
  "#0d9488",
];
const OTHER_COLOR = "#9ca3af";

/** Recharts types tooltip payloads as any; narrow structurally instead. */
function isTreemapDatum(value: unknown): value is TreemapDatum {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "traffic" in value &&
    "share" in value
  );
}

type CellProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  isOther?: boolean;
};

function TreemapCell(props: CellProps) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, name = "" } = props;
  if (width <= 0 || height <= 0) return null;
  const fill = props.isOther
    ? OTHER_COLOR
    : CELL_COLORS[index % CELL_COLORS.length];
  const showLabel = width > 70 && height > 26;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        fill={fill}
        fillOpacity={0.55}
        stroke="#fff"
        strokeOpacity={0.85}
      />
      {showLabel ? (
        <text
          x={x + 6}
          y={y + 16}
          fill="#fff"
          fontSize={11}
          fontWeight={500}
          pointerEvents="none"
        >
          {name.length > Math.floor(width / 7)
            ? `${name.slice(0, Math.max(3, Math.floor(width / 7) - 1))}…`
            : name}
        </text>
      ) : null}
    </g>
  );
}

/** Which few URLs carry the domain — top loaded pages sized by traffic. */
export function DomainPagesTreemap({
  rows,
}: {
  rows: Array<{
    page: string;
    relativePath: string | null;
    organicTraffic: number | null;
  }>;
}) {
  const data = useMemo(() => buildPagesTreemapData(rows), [rows]);
  const { containerRef, width: chartWidth } = useChartWidth();
  const height = 220;
  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <InsightIcon icon={LayoutGrid} tone="primary" />
        Traffic by page
      </h3>
      <p className="mt-0.5 text-xs text-base-content/50">
        The loaded pages sized by estimated organic traffic — how concentrated
        this domain&rsquo;s visibility is.
      </p>
      <div
        ref={containerRef}
        className="mt-2 w-full min-w-0"
        style={{ height }}
      >
        {chartWidth > 0 ? (
          <Treemap
            width={chartWidth}
            height={height}
            data={data}
            dataKey="traffic"
            nameKey="name"
            isAnimationActive={false}
            content={<TreemapCell />}
          >
            <Tooltip
              content={(props: TooltipContentProps<number, string>) => {
                const candidates = (props.payload ?? []).map(
                  (entry: { payload?: unknown }) => entry.payload,
                );
                const datum = candidates[0];
                if (!props.active || !isTreemapDatum(datum)) return null;
                return (
                  <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs shadow">
                    <div className="max-w-64 break-all font-medium">
                      {datum.name}
                    </div>
                    <div className="text-base-content/70">
                      {Math.round(datum.traffic).toLocaleString()} est. visits ·{" "}
                      {Math.round(datum.share * 100)}%
                    </div>
                  </div>
                );
              }}
            />
          </Treemap>
        ) : null}
      </div>
    </div>
  );
}
