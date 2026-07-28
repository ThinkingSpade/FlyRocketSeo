/* eslint-disable max-lines -- the keyword-trends form and its chart rendering stay colocated. */
import { useEffect, useMemo, useState } from "react";
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
import { computeMonthlyInterest } from "@/client/features/trends/trendsInsights";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { useProjectMarket } from "@/client/hooks/useProjectDomain";
import { ScopeControl } from "@/client/features/geo/ScopeControl";
import { TargetAreaBanner } from "@/client/features/geo/TargetAreaBanner";
import { useTargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import { useProjectSuggestions } from "@/client/features/insights/useProjectSuggestions";
import { useLastRunInput } from "@/client/features/insights/useLastRunInput";
import { resolvePrefill } from "@/client/features/insights/resolvePrefill";
import {
  useHandoff,
  writeHandoff,
} from "@/client/features/insights/handoffStore";
import { SuggestionChips } from "@/client/features/insights/SuggestionChips";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import { buildTrendsVerdict } from "@/client/features/insights/verdicts/keywords";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The `extract` this tab hands to `useLastRunInput`: pulls the keyword list
 * off the stored trends result and rejoins it into the same comma-separated
 * shape the input holds. A shape that has drifted (or isn't this feature's
 * result at all) returns null rather than throwing — the tab simply has no
 * last-run value to offer, same contract as the hook itself.
 */
function extractStoredKeywords(result: unknown): string | null {
  if (!isRecord(result)) return null;
  if (!Array.isArray(result.keywords)) return null;
  const keywords = result.keywords.filter(
    (keyword): keyword is string => typeof keyword === "string",
  );
  return keywords.length > 0 ? keywords.join(", ") : null;
}

/**
 * Adds one keyword to the comma-separated list rather than replacing it: this
 * field holds up to `MAX_TRENDS_KEYWORDS` keywords being compared side by
 * side, so a chip click that wiped out whatever the user had already typed
 * or added would be far more surprising than one that extends the list.
 * Case-insensitive de-dupe and the same cap `parseKeywords` enforces at
 * submit time keep a repeated click a harmless no-op instead of a visible
 * duplicate.
 */
function appendKeyword(current: string, next: string): string {
  const existing = parseKeywords(current);
  const normalized = next.trim().toLowerCase();
  if (existing.includes(normalized)) return existing.join(", ");
  return [...existing, normalized].slice(0, MAX_TRENDS_KEYWORDS).join(", ");
}

/**
 * Reshapes `computeMonthlyInterest`'s output (the same seasonality
 * computation `TrendsSeasonalHeatmap` renders below) into the
 * keyword-keyed record `buildTrendsVerdict` reads -- called from this same
 * page rather than lifted out of the heatmap, but it's a pure function of
 * `keywords`/`points` so both call sites can never disagree about a peak or
 * low month.
 */
function toSeriesByKeyword(
  monthlyInterest: ReturnType<typeof computeMonthlyInterest>,
): Record<string, Array<number | null>> {
  if (!monthlyInterest) return {};
  return Object.fromEntries(
    monthlyInterest.map((row) => [row.keyword, row.months]),
  );
}

/**
 * The submit button, paired with an invisible copy of the "Keywords
 * (comma-separated...)" label above it. The form aligns its columns with
 * `items-start` so the keyword column's chips (rendered after the input) can
 * never drag the other columns down -- but that only works if every column
 * starts with the same label-row height. This column has no real label, so
 * the phantom one here lands the button's own control at the input's
 * y-offset instead of flush with the field's label text. `hidden`/`sm:block`
 * keeps it out of the stacked mobile layout, where nothing pushes the button
 * down and this spacer would only add dead space.
 */
function CompareButton({
  disabled,
  isFetching,
}: {
  disabled: boolean;
  isFetching: boolean;
}) {
  return (
    <div className="form-control">
      <span
        aria-hidden="true"
        className="label-text hidden pb-1 text-xs font-medium invisible sm:block"
      >
        Compare
      </span>
      <button
        type="submit"
        className="btn btn-primary btn-sm gap-1.5"
        disabled={disabled}
      >
        {isFetching ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <Search className="size-3.5" />
        )}
        Compare
      </button>
    </div>
  );
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
  const [inputTouched, setInputTouched] = useState(false);
  // Gates the empty-state message below on what the field actually holds
  // right now, not on where that value came from: handoff, last-run memory,
  // and suggestion chips all populate `input` without ever touching `query`,
  // so deriving this from `query` alone left the tab telling the user to
  // "enter keywords" while a suggestion sat prefilled in the box.
  const enteredKeywords = parseKeywords(input);
  // Unlike SERP Overview/Content Optimizer/Topic Clusters, this tab has no
  // country field of its own today -- getKeywordTrends takes no
  // locationCode at all (see its own call below). `market.locationCode` is
  // only the header ScopeControl's own fallback, never read into the
  // metered query.
  const market = useProjectMarket(projectId);
  const targetAreaScope = useTargetAreaScope(projectId, market.locationCode);
  const [runKeywords, setRunKeywords] = useState<string[] | null>(null);
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, parseKeywords(input)),
  );

  const trendsQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: runKeywords != null,
    queryKey: ["keyword-trends", projectId, runKeywords],
    queryFn: () =>
      getKeywordTrends({
        data: { projectId, keywords: runKeywords ?? [] },
      }),
  });

  const errorMessage = trendsQuery.isError
    ? getStandardErrorMessage(trendsQuery.error)
    : null;

  const suggestions = useProjectSuggestions(projectId, "high-volume");
  const handoff = useHandoff(projectId);
  const lastRun = useLastRunInput(
    projectId,
    RUN_FEATURES.keywordTrends,
    extractStoredKeywords,
  );

  // Unlike every other tab, this field holds a LIST: `resolvePrefill` only
  // ever reads `suggestions[0]`, so joining just the top suggestion would
  // waste the two other slots the field can hold. The URL/handoff/last-run
  // levels stay exactly as authoritative as everywhere else -- passing an
  // empty suggestions array here means `resolved` reflects only those three
  // -- and only the bottom "suggestion" rung swaps one keyword for the top
  // three, joined the same way a restored run's keyword list already is.
  const resolved = resolvePrefill({
    kind: "keyword",
    searchParam: query,
    handoff,
    lastRun,
    suggestions: [],
    projectDefault: null,
  });
  const suggestedKeywords = suggestions
    .slice(0, 3)
    .map((suggestion) => suggestion.value)
    .join(", ");
  const prefillValue =
    resolved.value !== "" ? resolved.value : suggestedKeywords;

  // Every prefill source above resolves after first paint, so the `useState`
  // initializer can never see it. Seed the field once a value lands, but
  // never fight the user: bail as soon as they've typed or picked a chip
  // (inputTouched), and even before that, bail if the field is non-empty.
  useEffect(() => {
    if (inputTouched) return;
    if (input.trim() !== "") return;
    if (prefillValue === "") return;
    setInput(prefillValue);
  }, [inputTouched, input, prefillValue]);
  // Restoring the project's last trends run is free: it reads a stored row plus
  // the R2 object that run already paid for, never a metered fetch.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.keywordTrends,
    schema: trendsResultSchema,
    enabled: runKeywords == null,
    runId: selectedRunId,
  });
  const result = trendsQuery.data ?? restored?.result;
  const restoredRun = trendsQuery.data == null ? restored : null;
  const seriesByKeyword = useMemo(
    () =>
      toSeriesByKeyword(
        result ? computeMonthlyInterest(result.keywords, result.points) : null,
      ),
    [result],
  );

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Activity className="size-5" />
            Keyword Trends
          </h1>
          <p className="text-sm text-base-content/60">
            Compare Google Trends interest over time for up to{" "}
            {MAX_TRENDS_KEYWORDS} keywords — spot seasonality and momentum
            before committing to a topic.
          </p>
        </div>
        <ScopeControl
          area={targetAreaScope.area}
          onChange={targetAreaScope.onChange}
          hasConfirmedArea={targetAreaScope.hasConfirmedArea}
          onClear={targetAreaScope.onClear}
        />
      </div>

      <TargetAreaBanner projectId={projectId} />

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
            onSubmit={(event) => {
              event.preventDefault();
              const next = parseKeywords(input);
              if (next.length === 0) return;
              setRunKeywords(next);
              run.authorize();
              // Hands the primary (first) keyword to whichever tab the user
              // opens next -- the list itself is this tab's own concept, but
              // every other tab's field only knows how to take one keyword.
              writeHandoff(projectId, {
                kind: "keyword",
                value: next[0],
                source: "Keyword Trends",
                at: Date.now(),
              });
              navigate({
                search: (prev) => ({ ...prev, q: next.join(", ") }),
                replace: false,
              });
            }}
          >
            <div className="flex w-full flex-col gap-1.5 sm:max-w-xl">
              <label className="form-control w-full">
                <span className="label-text pb-1 text-xs font-medium">
                  Keywords (comma-separated, up to {MAX_TRENDS_KEYWORDS})
                </span>
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  placeholder="seo tools, keyword research, rank tracker"
                  value={input}
                  onChange={(event) => {
                    setInputTouched(true);
                    setInput(event.target.value);
                  }}
                />
              </label>
              <SuggestionChips
                suggestions={suggestions}
                value={input}
                onSelect={(next) => {
                  setInputTouched(true);
                  setInput(appendKeyword(input, next));
                }}
                disabled={trendsQuery.isFetching}
              />
            </div>
            <CompareButton
              disabled={!input.trim() || trendsQuery.isFetching}
              isFetching={trendsQuery.isFetching}
            />
          </form>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-error text-sm">{errorMessage}</div>
      ) : null}

      {runKeywords == null ? (
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
            setRunKeywords(restoredRun.result.keywords);
            run.authorize(
              createMeteredRunKey(projectId, restoredRun.result.keywords),
            );
            navigate({
              search: (prev) => ({ ...prev, q: next }),
              replace: false,
            });
          }}
        />
      ) : null}

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body p-4">
          {runKeywords == null && !restoredRun ? (
            <div className="px-4 py-12 text-center text-sm text-base-content/60">
              {enteredKeywords.length > 0
                ? "Keywords are prefilled. Click Compare to fetch paid trend data."
                : "Enter keywords above to chart their Google Trends interest."}
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
        <NextStepsCard
          verdict={buildTrendsVerdict({
            keywords: result.keywords,
            seriesByKeyword,
          })}
          projectId={projectId}
          tab="Keyword Trends"
        />
      ) : null}

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
