import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { getDomainRankHistory } from "@/serverFunctions/domain";
import { useChartWidth } from "@/client/features/rank-tracking/RankTrackingTrendChart";

/** Narrowed shape of a recharts tooltip payload entry (typed `any` upstream). */
interface RechartsPayloadEntry {
  name?: string;
  value?: number | string | null;
  color?: string;
}

const KEYWORDS_COLOR = "#2563eb";

function formatMonth(value: string): string {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function DomainVisibilityTrend({
  projectId,
  domain,
  locationCode,
  languageCode,
}: {
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
}) {
  const trimmedDomain = domain.trim();
  const query = useQuery({
    enabled: trimmedDomain !== "",
    queryKey: ["domain-rank-history", projectId, trimmedDomain, locationCode],
    queryFn: () =>
      getDomainRankHistory({
        data: {
          projectId,
          domain: trimmedDomain,
          locationCode,
          languageCode,
        },
      }),
    staleTime: 30 * 60_000,
  });

  const points = query.data?.points ?? [];
  const { containerRef, width: chartWidth } = useChartWidth();
  const height = 220;

  return (
    <div className="border border-base-300 rounded-xl bg-base-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
        <div>
          <h2 className="text-sm font-semibold">Organic Visibility Trend</h2>
          <p className="text-xs text-base-content/50">
            Monthly ranking keywords over time
          </p>
        </div>
        {query.isFetching ? (
          <span className="loading loading-spinner loading-xs" />
        ) : null}
      </div>

      <div className="p-4">
        {query.isFetching && points.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="loading loading-spinner" />
          </div>
        ) : points.length === 0 ? (
          <p className="py-8 text-center text-sm text-base-content/50">
            No historical visibility data available for this domain.
          </p>
        ) : (
          <div ref={containerRef} className="w-full min-w-0" style={{ height }}>
            {chartWidth > 0 ? (
              <AreaChart
                width={chartWidth}
                height={height}
                data={points}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient
                    id="visibilityFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={KEYWORDS_COLOR}
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="100%"
                      stopColor={KEYWORDS_COLOR}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  opacity={0.1}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatMonth}
                  tick={{ fontSize: 10, fill: "#888" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#888" }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(value: number) => value.toLocaleString()}
                />
                <Tooltip
                  content={(props: TooltipContentProps<number, string>) => {
                    const { active, payload, label } = props;
                    if (!active || !payload?.length) return null;
                    const entries: RechartsPayloadEntry[] = payload.map(
                      (entry: RechartsPayloadEntry) => ({ value: entry.value }),
                    );
                    const value = entries[0]?.value;
                    return (
                      <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs shadow">
                        <div className="pb-0.5 font-medium">
                          {formatMonth(String(label))}
                        </div>
                        <div>
                          {typeof value === "number"
                            ? value.toLocaleString()
                            : "—"}{" "}
                          keywords
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ stroke: "rgba(150,150,150,0.3)" }}
                />
                <Area
                  type="monotone"
                  dataKey="organicKeywords"
                  name="Organic keywords"
                  stroke={KEYWORDS_COLOR}
                  strokeWidth={2}
                  fill="url(#visibilityFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
