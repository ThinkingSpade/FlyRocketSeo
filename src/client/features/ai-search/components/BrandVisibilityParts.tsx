import { useMemo, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Quotes,
  MagnifyingGlass,
  TrendUp,
} from "@phosphor-icons/react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { echarts } from "@/client/components/chart/echarts";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import { formatCount } from "@/client/features/ai-search/platformLabels";

/**
 * Presentational pieces for the project-centric AI Visibility panel. Pure props
 * so they render identically from a live analysis or a stored snapshot. View
 * types mirror the server's brand-visibility shapes (kept local so the client
 * boundary stays clean, same convention as onPageModel).
 */

type TrendPointView = {
  capturedOn: string;
  totalMentions: number | null;
  chatgptMentions: number | null;
  googleMentions: number | null;
  targetSharePct: number | null;
};

type DeltaView = {
  totalMentions: number | null;
  targetSharePct: number | null;
  previousCapturedOn: string;
} | null;

type OpportunityView = {
  kind: "share_of_voice" | "prompt_absence";
  title: string;
  detail: string;
  metric: number;
  competitor?: string;
  question?: string;
};

/** A signed change, green when up (more visibility is always the good direction). */
function DeltaPill({
  value,
  suffix = "",
}: {
  value: number | null;
  suffix?: string;
}) {
  if (value == null || value === 0) return null;
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${
        up ? "text-success" : "text-error"
      }`}
    >
      <Icon className="size-3.5" />
      {up ? "+" : "−"}
      {formatCount(Math.abs(value))}
      {suffix}
    </span>
  );
}

function StatTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-base-content/50">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {delta}
      </div>
    </div>
  );
}

/** Headline mentions + share-of-voice, each with its change since last check. */
export function VisibilityStatTiles({
  latest,
  delta,
}: {
  latest: TrendPointView;
  delta: DeltaView;
}) {
  const share =
    latest.targetSharePct == null
      ? "—"
      : `${Math.round(latest.targetSharePct)}%`;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile
        label="AI mentions"
        value={formatCount(latest.totalMentions)}
        delta={<DeltaPill value={delta?.totalMentions ?? null} />}
      />
      <StatTile
        label="Share of voice"
        value={share}
        delta={
          <DeltaPill value={delta?.targetSharePct ?? null} suffix=" pts" />
        }
      />
      <div className="rounded-xl border border-base-300 bg-base-100 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-base-content/50">
          By platform
        </p>
        <div className="mt-2 space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-base-content/70">ChatGPT</span>
            <span className="font-medium tabular-nums">
              {formatCount(latest.chatgptMentions)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-base-content/70">Google AI Overview</span>
            <span className="font-medium tabular-nums">
              {formatCount(latest.googleMentions)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Unchanged from the Recharts line's `stroke`. */
const MENTIONS_COLOR = "hsl(220 70% 50%)";

/** Tracked mention trend from stored snapshots — needs at least two points. */
export function VisibilityTrendChart({ series }: { series: TrendPointView[] }) {
  const theme = useChartTheme();
  const base = useChartBase(theme);

  const { labels, values } = useMemo(
    () => ({
      labels: series.map((point) => point.capturedOn.slice(5)), // MM-DD
      // Keep unknown totals as null (not 0) so a failed metrics call doesn't
      // draw a false drop to zero; connectNulls bridges the gap instead.
      values: series.map((point) => point.totalMentions),
    }),
    [series],
  );

  const options = useMemo(
    () => ({
      ...base,
      tooltip: {
        ...base.tooltip,
        // `dangerousHtmlFormatter`, not `formatter`: Kumo destructures this key
        // out and hands it to ECharts AS `formatter`, overwriting anything
        // passed under that name with undefined. A tooltip that spelled it
        // `formatter` would silently fall back to the ECharts default.
        dangerousHtmlFormatter: (params: unknown) => {
          const [first] = tooltipRows(params);
          if (!first) return "";
          return [
            `<div style="font-size:11px;opacity:0.6">${first.axisValue}</div>`,
            `<div style="font-size:13px;font-weight:500">${formatCount(first.value)} mentions</div>`,
          ].join("");
        },
      },
      xAxis: {
        ...base.axisCommon,
        // Category, not time: these are the capture dates of stored snapshots
        // taken at whatever cadence the project runs, and spacing them by
        // elapsed time would stretch the gaps between checks.
        type: "category" as const,
        data: labels,
        boundaryGap: false,
        axisLabel: {
          ...base.axisCommon.axisLabel,
          fontSize: 11,
          hideOverlap: true,
        },
      },
      yAxis: {
        ...base.axisCommon,
        type: "value" as const,
        // Recharts' allowDecimals={false}.
        minInterval: 1,
        axisLabel: { ...base.axisCommon.axisLabel, fontSize: 11 },
      },
      series: [
        {
          type: "line" as const,
          data: values,
          smooth: true,
          // `showSymbol: false` rather than `symbol: "none"`: Recharts drew no
          // dots along the line but kept its default hover dot, and only this
          // form keeps the point marker on the hovered value.
          showSymbol: false,
          symbolSize: 6,
          connectNulls: true,
          lineStyle: { width: 2, color: MENTIONS_COLOR },
          itemStyle: { color: MENTIONS_COLOR },
        },
      ],
    }),
    [base, labels, values],
  );

  // Need at least two points that actually have a total to draw a trend line.
  if (values.filter((value) => value != null).length < 2) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div className="border-b border-base-300 px-4 py-3">
        <h3 className="text-sm font-semibold">AI mentions over time</h3>
      </div>
      <div className="p-4">
        <Chart
          echarts={echarts}
          options={options}
          height={192}
          isDarkMode={theme.isDark}
          className="w-full min-w-0"
        />
      </div>
    </section>
  );
}

/** "Improve your AI visibility" — SoV + prompt-absence gaps from the lookup. */
export function VisibilityOpportunities({
  opportunities,
}: {
  opportunities: OpportunityView[];
}) {
  if (opportunities.length === 0) return null;
  return (
    <section className="rounded-xl border border-base-300 bg-base-100">
      <div className="border-b border-base-300 px-4 py-3">
        <h3 className="text-sm font-semibold">Improve your AI visibility</h3>
        <p className="text-xs text-base-content/60">
          Gaps found in your latest analysis — no extra lookups spent.
        </p>
      </div>
      <ul className="divide-y divide-base-200">
        {opportunities.map((opportunity, index) => {
          const Icon =
            opportunity.kind === "share_of_voice"
              ? TrendUp
              : opportunity.question
                ? Quotes
                : MagnifyingGlass;
          return (
            <li
              key={`${opportunity.kind}-${index}`}
              className="flex items-start gap-3 px-4 py-3"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-base-content/40" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{opportunity.title}</p>
                <p className="text-xs text-base-content/60">
                  {opportunity.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
