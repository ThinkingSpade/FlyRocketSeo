import { useMemo } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Minus,
} from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import {
  computeMonthlyInterest,
  computeTrendInsights,
  type KeywordTrendInsight,
} from "@/client/features/trends/trendsInsights";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Table } from "@cloudflare/kumo/components/table";

// Series palette matching the rank-tracking charts; shared with the chart in
// TrendsPage so row dots line up with the plotted lines.
export const SERIES_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#9333ea",
];

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
] as const;

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function MomentumBadge({ insight }: { insight: KeywordTrendInsight }) {
  if (insight.momentum == null) {
    return <span className="text-base-content/40">—</span>;
  }
  const styles = {
    rising: "success",
    stable: "neutral",
    falling: "error",
  } as const;
  const icons = {
    rising: <ArrowUpRight className="size-3" />,
    stable: <Minus className="size-3" />,
    falling: <ArrowDownRight className="size-3" />,
  } as const;
  return (
    <Badge variant={styles[insight.momentum]}>
      {icons[insight.momentum]}
      {formatPercent(insight.momentumPercent)}
    </Badge>
  );
}

/** Momentum and seasonality cuts of the charted series — no extra fetches. */
export function TrendsInsightsTable({
  keywords,
  points,
}: {
  keywords: string[];
  points: Array<{ timestamp: number; values: (number | null)[] }>;
}) {
  const insights = useMemo(
    () => computeTrendInsights(keywords, points),
    [keywords, points],
  );

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={Activity} tone="primary" />
          Momentum &amp; seasonality
        </h2>
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Keyword</Table.Head>
                <Table.Head className="text-right">Interest now</Table.Head>
                <Table.Head
                  className="text-right"
                  title="Average interest over the last 90 days vs the 90 days before"
                >
                  90-day momentum
                </Table.Head>
                <Table.Head
                  className="text-right"
                  title="Latest interest vs roughly one year earlier"
                >
                  Year over year
                </Table.Head>
                <Table.Head className="text-right">Peak month</Table.Head>
                <Table.Head className="text-right">Low month</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {insights.map((insight, index) => (
                <Table.Row key={insight.keyword}>
                  <Table.Cell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: SERIES_COLORS[index] }}
                      />
                      {insight.keyword}
                    </span>
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">
                    {insight.latest ?? "—"}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <MomentumBadge insight={insight} />
                  </Table.Cell>
                  <Table.Cell className="text-right tabular-nums">
                    {formatPercent(insight.yoyPercent)}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {insight.peakMonth != null
                      ? MONTH_LABELS[insight.peakMonth]
                      : "—"}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {insight.lowMonth != null
                      ? MONTH_LABELS[insight.lowMonth]
                      : "—"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
        <p className="text-xs text-base-content/50">
          Momentum compares the last 90 days to the 90 before; peak and low
          months average the full charted range.
        </p>
      </div>
    </div>
  );
}

/** Keyword × month heatmap: average interest per calendar month. */
export function TrendsSeasonalHeatmap({
  keywords,
  points,
}: {
  keywords: string[];
  points: Array<{ timestamp: number; values: (number | null)[] }>;
}) {
  const rows = useMemo(
    () => computeMonthlyInterest(keywords, points),
    [keywords, points],
  );
  if (!rows) return null;

  return (
    <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <InsightIcon icon={CalendarDays} tone="info" />
          Seasonal heatmap
        </h2>
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Keyword</Table.Head>
                {MONTH_LABELS.map((label) => (
                  <Table.Head key={label} className="text-center">
                    {label}
                  </Table.Head>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.keyword}>
                  <Table.Cell className="max-w-48 font-medium">
                    <span className="line-clamp-1">{row.keyword}</span>
                  </Table.Cell>
                  {row.months.map((value, month) => (
                    <Table.Cell key={month} className="p-1 text-center">
                      {value == null ? (
                        <span className="text-base-content/30">—</span>
                      ) : (
                        <span
                          className="inline-flex h-7 w-9 items-center justify-center rounded text-xs font-medium tabular-nums"
                          style={{
                            backgroundColor: `oklch(62% 0.19 260 / ${
                              0.08 + (value / 100) * 0.72
                            })`,
                            color: value >= 60 ? "white" : "var(--fallback-bc)",
                          }}
                          title={`${row.keyword} · ${MONTH_LABELS[month]}: ${value}`}
                        >
                          {value}
                        </span>
                      )}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
        <p className="text-xs text-base-content/50">
          Average Google Trends interest per calendar month across the charted
          range — darker means stronger demand. Plan content a month or two
          ahead of the peaks.
        </p>
      </div>
    </div>
  );
}
