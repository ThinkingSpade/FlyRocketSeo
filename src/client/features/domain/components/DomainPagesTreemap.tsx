import { useMemo } from "react";
import { SquaresFour } from "@phosphor-icons/react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { InsightIcon } from "@/client/components/InsightTile";
import { echarts } from "@/client/components/chart/echarts";
import { escapeHtml } from "@/client/components/chart/tooltipHtml";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
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

/**
 * The Recharts rects' `fillOpacity={0.55}`, carried in the colour itself.
 *
 * Not the series-level `itemStyle.colorAlpha` ECharts offers: that belongs to
 * the treemap's visual-mapping pipeline and loses to a per-node
 * `itemStyle.color`, which every cell here sets. Setting it there looked right
 * and did nothing — the cells painted fully saturated.
 */
const CELL_ALPHA = Math.round(0.55 * 255)
  .toString(16)
  .padStart(2, "0");

/** The same two lines the React tooltip rendered, as markup. */
function tooltipHtml(datum: TreemapDatum): string {
  return [
    `<div style="max-width:16rem;word-break:break-all;font-size:12px;font-weight:500">${escapeHtml(datum.name)}</div>`,
    `<div style="font-size:12px;opacity:0.7">${Math.round(datum.traffic).toLocaleString()} est. visits · ${Math.round(datum.share * 100)}%</div>`,
  ].join("");
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
  const theme = useChartTheme();
  const base = useChartBase(theme);
  const height = 220;

  // A treemap tooltip only gets the node's name and value, and the share is
  // neither, so the name indexes back into the source rows.
  const byName = useMemo(
    () => new Map(data.map((datum) => [datum.name, datum])),
    [data],
  );

  const options = useMemo(
    () => ({
      // No `grid` here, unlike the cartesian charts: a treemap lays itself out
      // in the whole container and has no axes to reserve room for.
      textStyle: base.textStyle,
      tooltip: {
        ...base.tooltip,
        // The shared base triggers on the axis, which a treemap does not have —
        // without this override the tooltip never appears.
        trigger: "item" as const,
        // `dangerousHtmlFormatter`, not `formatter`: Kumo's Chart rewrites the
        // tooltip as `{...rest, formatter: dangerousHtmlFormatter}` before
        // calling setOption, so a plain `formatter` is overwritten with
        // undefined and ECharts' default tooltip shows instead. The name warns
        // about untrusted HTML — hence `escapeHtml` on the page path.
        dangerousHtmlFormatter: (params: unknown) => {
          const [first] = tooltipRows(params);
          if (!first) return "";
          const datum = byName.get(first.axisValue);
          return datum ? tooltipHtml(datum) : "";
        },
      },
      series: [
        {
          type: "treemap" as const,
          data: data.map((datum, index) => ({
            name: datum.name,
            value: datum.traffic,
            // Per-cell colour, which is what the custom `content` renderer did
            // by indexing the palette itself. The "other" bucket keeps its grey.
            itemStyle: {
              color: `${
                datum.isOther
                  ? OTHER_COLOR
                  : CELL_COLORS[index % CELL_COLORS.length]
              }${CELL_ALPHA}`,
            },
          })),
          // Fill the frame: ECharts otherwise centres the treemap in 80% of it.
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          // The Recharts treemap was a flat, static picture — no drill-down, no
          // panning, and so nothing to breadcrumb back out of.
          roam: false,
          nodeClick: false as const,
          breadcrumb: { show: false },
          animation: false,
          itemStyle: {
            // The panel colour, not a fixed white: the gaps between cells
            // should read as the page showing through, which on the dark theme
            // is near-black. Hardcoded white drew bright gridlines there.
            borderColor: theme.surface,
            borderWidth: 1,
            borderRadius: 3,
            gapWidth: 0,
          },
          label: {
            show: true,
            position: "insideTopLeft" as const,
            // The cells are their colour at 55% over the panel, so they are
            // pale on the light theme and dark on the dark one — a fixed white
            // label reads on one and barely on the other. The theme's own text
            // colour is the contrasting one against the panel by definition,
            // and each cell is mostly panel.
            color: theme.text,
            fontSize: 11,
            fontWeight: 500,
            padding: [4, 6],
            // ECharts fits the label to the cell and ellipsises it, which is
            // what the hand-rolled `name.slice(...)` was approximating.
            overflow: "truncate" as const,
          },
        },
      ],
    }),
    [base, byName, data, theme.surface, theme.text],
  );

  if (data.length === 0) return null;

  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <InsightIcon icon={SquaresFour} tone="primary" />
        Traffic by page
      </h3>
      <p className="mt-0.5 text-xs text-base-content/50">
        The loaded pages sized by estimated organic traffic — how concentrated
        this domain&rsquo;s visibility is.
      </p>
      <Chart
        echarts={echarts}
        options={options}
        height={height}
        isDarkMode={theme.isDark}
        className="mt-2 w-full min-w-0"
      />
    </div>
  );
}
