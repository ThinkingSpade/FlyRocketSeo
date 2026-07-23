import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Search } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getKeywordTrends } from "@/serverFunctions/trends";
import { trendsResultSchema } from "@/types/schemas/trends";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import { MAX_TRENDS_KEYWORDS } from "@/types/schemas/trends";
import { useChartWidth } from "@/client/features/rank-tracking/RankTrackingTrendChart";
import {
  SERIES_COLORS,
  TrendsInsightsTable,
  TrendsSeasonalHeatmap,
} from "@/client/features/trends/TrendsInsightsTable";

type TrendsNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

/** Narrowed shape of a recharts tooltip payload entry (typed `any` upstream). */
interface RechartsPayloadEntry {
  name?: string;
  value?: number | string | null;
  color?: string;
}

function parseKeywords(query: string): string[] {
  return [
    ...new Set(
      query
        .split(",")
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, MAX_TRENDS_KEYWORDS);
}

export function TrendsPage({
  projectId,
  navigate,
  query,
}: {
  projectId: string;
  navigate: TrendsNavigate;
  query: string;
}) {
  const [input, setInput] = useState(query);
  const keywords = parseKeywords(query);

  const trendsQuery = useQuery({
    enabled: keywords.length > 0,
    queryKey: ["keyword-trends", projectId, keywords],
    queryFn: () =>
      getKeywordTrends({
        data: { projectId, keywords },
      }),
    staleTime: 5 * 60_000,
  });

  const errorMessage = trendsQuery.isError
    ? getStandardErrorMessage(trendsQuery.error)
    : null;
  // Restoring the project's last trends run is free: it reads a stored row plus
  // the R2 object that run already paid for, never a metered fetch.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.keywordTrends,
    schema: trendsResultSchema,
    enabled: keywords.length === 0,
    runId: selectedRunId,
  });
  const result = trendsQuery.data ?? restored?.result;
  const restoredRun = trendsQuery.data == null ? restored : null;

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Activity className="size-5" />
          Keyword Trends
        </h1>
        <p className="text-sm text-base-content/60">
          Compare Google Trends interest over time for up to{" "}
          {MAX_TRENDS_KEYWORDS} keywords — spot seasonality and momentum before
          committing to a topic.
        </p>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const next = parseKeywords(input);
              if (next.length === 0) return;
              navigate({
                search: (prev) => ({ ...prev, q: next.join(", ") }),
                replace: false,
              });
            }}
          >
            <label className="form-control w-full sm:max-w-xl">
              <span className="label-text pb-1 text-xs font-medium">
                Keywords (comma-separated, up to {MAX_TRENDS_KEYWORDS})
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="seo tools, keyword research, rank tracker"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!input.trim() || trendsQuery.isFetching}
            >
              {trendsQuery.isFetching ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Search className="size-3.5" />
              )}
              Compare
            </button>
          </form>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-error text-sm">{errorMessage}</div>
      ) : null}

      {keywords.length === 0 ? (
        <RecentRunsList
          projectId={projectId}
          feature={RUN_FEATURES.keywordTrends}
          activeRunId={selectedRunId}
          onSelect={setSelectedRunId}
        />
      ) : null}

      {restoredRun ? (
        <RestoredRunBanner
          label={restoredRun.label}
          lastRanAt={restoredRun.lastRanAt}
          runCount={restoredRun.runCount}
          onRunAgain={() => {
            const next = restoredRun.result.keywords.join(", ");
            setInput(next);
            navigate({
              search: (prev) => ({ ...prev, q: next }),
              replace: false,
            });
          }}
        />
      ) : null}

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          {keywords.length === 0 && !restoredRun ? (
            <div className="px-4 py-12 text-center text-sm text-base-content/60">
              Enter keywords above to chart their Google Trends interest.
            </div>
          ) : trendsQuery.isFetching && !result ? (
            <div className="flex items-center justify-center py-16">
              <span className="loading loading-spinner" />
            </div>
          ) : !result || result.points.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-base-content/60">
              No trend data available for these keywords.
            </div>
          ) : (
            <TrendsChart
              keywords={result.keywords}
              averages={result.averages}
              points={result.points}
            />
          )}
        </div>
      </div>

      {result && result.points.length > 0 ? (
        <div className="grid items-start gap-3 xl:grid-cols-2">
          <TrendsInsightsTable
            keywords={result.keywords}
            points={result.points}
          />
          <TrendsSeasonalHeatmap
            keywords={result.keywords}
            points={result.points}
          />
        </div>
      ) : null}
    </div>
  );
}

function TrendsChart({
  keywords,
  averages,
  points,
}: {
  keywords: string[];
  averages: (number | null)[];
  points: Array<{ timestamp: number; date: string; values: (number | null)[] }>;
}) {
  const { containerRef, width: chartWidth } = useChartWidth();
  const height = 288;

  const data = points.map((point) => {
    const row: Record<string, number | null> = { timestamp: point.timestamp };
    keywords.forEach((keyword, index) => {
      row[keyword] = point.values[index];
    });
    return row;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {keywords.map((keyword, index) => (
          <span
            key={keyword}
            className="inline-flex items-center gap-1.5 text-sm"
          >
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: SERIES_COLORS[index] }}
            />
            {keyword}
            <span className="text-base-content/50">
              avg {averages[index] ?? "—"}
            </span>
          </span>
        ))}
      </div>
      <div ref={containerRef} className="w-full min-w-0" style={{ height }}>
        {chartWidth > 0 ? (
          <LineChart
            width={chartWidth}
            height={height}
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              opacity={0.1}
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value: number) =>
                new Date(value).toLocaleDateString("en-US", {
                  month: "short",
                  year: "2-digit",
                })
              }
              tick={{ fontSize: 10, fill: "#888" }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[0, 100]}
              allowDecimals={false}
              tick={{ fontSize: 10, fill: "#888" }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              content={(props: TooltipContentProps<number, string>) => {
                const { active, payload, label } = props;
                if (!active || !payload?.length || typeof label !== "number") {
                  return null;
                }
                // Recharts types payload entries as any; narrow them first.
                const entries: RechartsPayloadEntry[] = payload.map(
                  (entry: RechartsPayloadEntry) => ({
                    name: entry.name,
                    value: entry.value,
                    color: entry.color,
                  }),
                );
                return (
                  <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs shadow">
                    <div className="pb-1 font-medium">
                      {new Date(label).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    {entries.map((entry) => (
                      <div
                        key={entry.name ?? ""}
                        className="flex items-center gap-1.5"
                      >
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        {entry.name ?? ""}:{" "}
                        {typeof entry.value === "number" ? entry.value : "—"}
                      </div>
                    ))}
                  </div>
                );
              }}
              cursor={{ stroke: "rgba(150,150,150,0.3)" }}
            />
            {keywords.map((keyword, index) => (
              <Line
                key={keyword}
                type="monotone"
                dataKey={keyword}
                name={keyword}
                stroke={SERIES_COLORS[index]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        ) : null}
      </div>
      <p className="text-xs text-base-content/50">
        Interest is relative to the peak (100) across the selected keywords and
        time range — it is not absolute search volume.
      </p>
    </div>
  );
}
