/**
 * The 12-month search-volume area chart, deliberately kept OUT of this
 * folder's barrel (`components/index.ts`).
 *
 * It used to live in `DisplayPrimitives.tsx`, which the barrel re-exports --
 * and `KeywordUi.tsx` re-exported it a second time. recharts is a static
 * import, so every module that touched the barrel for something trivial
 * dragged the whole charting library into the shared graph with it. The
 * barrel's real consumers are things like `client/components/table/
 * SortableHeader.tsx`, the backlinks tables and the domain tables, all of
 * which want only `HeaderHelpLabel` or `IntentBadge` -- so recharts (195 KB)
 * landed in the CLIENT ENTRY chunk and was downloaded and parsed by every
 * visitor on every route, including sign-in.
 *
 * This is the same barrel-drag that made the dataforseo SDK unremovable from
 * the Worker startup chunk until `dataforseo/index.ts` stopped re-exporting
 * its SDK-carrying fetchers (see scripts/assert-startup-clean.mjs). The rule
 * that generalises: a barrel is a static dependency edge from EVERY importer
 * to EVERY re-exported module, so nothing behind one may statically import a
 * heavy leaf library.
 *
 * Import this module directly (`./AreaTrendChart`), never via the barrel, and
 * keep recharts out of anything the barrel can reach.
 */
import { useEffect, useRef, useState } from "react";
import { sortBy } from "remeda";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  const sorted = sortBy(trend, (item) => item.year * 100 + item.month);
  const last12 = sorted.slice(-12);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);

  if (last12.length === 0) return null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      setChartWidth(container.clientWidth);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const data = last12.map((m) => ({
    month: MONTH_LABELS[m.month - 1],
    year: m.year,
    searchVolume: m.searchVolume,
    label: `${MONTH_LABELS[m.month - 1]} ${m.year}`,
  }));

  return (
    <div
      ref={containerRef}
      className="w-full h-[210px] min-w-0"
      aria-label="Search trend chart"
    >
      {chartWidth > 0 ? (
        <AreaChart
          width={chartWidth}
          height={210}
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity="var(--trend-fill-start-opacity)"
              />
              <stop
                offset="100%"
                stopColor="var(--color-primary)"
                stopOpacity="var(--trend-fill-end-opacity)"
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--trend-grid-color)"
            strokeDasharray="2 4"
            vertical={true}
            horizontal={true}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: "var(--trend-axis-color)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number | string) =>
              formatCompactNumber(Number(value))
            }
            tick={{ fill: "var(--trend-axis-color)", fontSize: 11 }}
            width={44}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--trend-tooltip-bg)",
              border: "1px solid var(--trend-tooltip-border)",
              borderRadius: "10px",
              boxShadow: "0 8px 24px var(--trend-tooltip-shadow)",
              color: "var(--color-base-content)",
            }}
          />
          <Area
            type="monotone"
            dataKey="searchVolume"
            name="Search volume"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#trendGrad)"
            isAnimationActive={false}
            dot={{ r: 3, fill: "var(--color-primary)", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "var(--color-primary)" }}
          />
        </AreaChart>
      ) : null}
    </div>
  );
}
