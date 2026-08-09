/* eslint-disable max-lines -- the keyword-trends form and its chart rendering stay colocated. */
import { useEffect, useMemo, useState } from "react";
import { Activity, Search } from "lucide-react";
import { Chart } from "@cloudflare/kumo/components/chart";
import { echarts } from "@/client/components/chart/echarts";
import { escapeHtml } from "@/client/components/chart/tooltipHtml";
import { tooltipRows } from "@/client/components/chart/tooltipParams";
import {
  useChartBase,
  useChartTheme,
} from "@/client/components/chart/useChartTheme";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getKeywordTrends } from "@/serverFunctions/trends";
import { trendsResultSchema } from "@/types/schemas/trends";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import { MAX_TRENDS_KEYWORDS } from "@/types/schemas/trends";
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
import { TrendingOpportunitiesCard } from "@/client/features/trends/TrendingOpportunitiesCard";
import { TargetAreaBanner } from "@/client/features/geo/TargetAreaBanner";
import { useTargetAreaScope } from "@/client/features/geo/useTargetAreaScope";
import {
  parseStoredGeo,
  resolveRunGeo,
  toStoredMetricGeo,
} from "@/client/features/geo/resolveRunGeo";
import { describeGeoRunError } from "@/client/features/geo/geoUnavailableMessage";
import type { ResolvedGeo, TargetArea } from "@/shared/geo/types";
import { trendsGeoBundleSchema } from "@/types/schemas/trends";
import { STORED_GEO_BUNDLE_VERSION } from "@/types/schemas/geo";
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
import { AppPageShell } from "@/client/components/AppPageShell";
import { Button } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Input } from "@cloudflare/kumo/components/input";

type TrendsNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

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
 * Captured once at authorize()-time (submit / "Run again"), never
 * recomputed later from the live scope control -- see resolveRunGeo.ts's
 * own header for why. Reuses the "keyword-volume" need: Trends has no
 * `GeoNeed` of its own, but that need's local/national split (Google Ads
 * metro vs. Labs country) is exactly the local/worldwide split this tab
 * needs too, and it's the same need Keyword Research/SERP Overview already
 * resolve their own volume from.
 */
function captureTrendsRunGeo(
  area: TargetArea,
  sessionLocationCode: number,
): ResolvedGeo {
  return resolveRunGeo("keyword-volume", area, sessionLocationCode);
}

/**
 * Unlike every other tab's "national" scope, Trends' own default is not the
 * session's country -- `getKeywordTrends` OMITS `locationCode` entirely when
 * no compatible target area applies (see the query below), which the
 * DataForSEO Trends Explore endpoint documents as WORLDWIDE interest, not
 * country-scoped. Labeling that "United States" (resolveRunGeo's own
 * national-branch label) would overclaim a specificity this tab never
 * actually queried for -- so this label is bespoke to this tab rather than
 * reusing the shared `geoMetricSuffix`, which assumes national == the
 * session's own country (true everywhere else, not here).
 */
function trendsMetricLabel(geo: ResolvedGeo | null): string {
  if (!geo) return "Interest";
  return geo.scope === "local" ? `Interest · ${geo.label}` : "Interest";
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
        className="hidden pb-1 text-xs font-medium invisible sm:block"
      >
        Compare
      </span>
      <Button type="submit" variant="primary" size="sm" disabled={disabled}>
        {isFetching ? <Loader size="sm" /> : <Search className="size-3.5" />}
        Compare
      </Button>
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
  // country field of its own today -- `market.locationCode` only seeds
  // `useTargetAreaScope`'s own country fallback and `captureTrendsRunGeo`'s
  // session location below, never sent to getKeywordTrends directly.
  const market = useProjectMarket(projectId);
  const targetAreaScope = useTargetAreaScope(projectId, market.locationCode);
  const [runKeywords, setRunKeywords] = useState<string[] | null>(null);
  // The geo CAPTURED for the run in `runKeywords` -- set in the same breath
  // as `runKeywords` itself (submit / "Run again" below), never recomputed
  // from live scope afterward. Null for a restored (not re-run) result --
  // see the `effectiveGeo`/restore branch below, which reads that run's OWN
  // persisted geo bundle instead.
  const [runGeo, setRunGeo] = useState<ResolvedGeo | null>(null);
  // The session location `runGeo` above was captured against (Defect 1
  // fix) -- captured alongside it, never re-read from `market.locationCode`
  // later, so a persisted bundle's `parentCountryCode` always describes
  // what this run actually used even if the project's market later changes.
  const [runGeoCountryCode, setRunGeoCountryCode] = useState<number | null>(
    null,
  );
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, parseKeywords(input)),
  );

  const trendsQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: runKeywords != null,
    queryKey: ["keyword-trends", projectId, runKeywords, runGeo?.locationCode],
    queryFn: () =>
      getKeywordTrends({
        data: {
          projectId,
          keywords: runKeywords ?? [],
          // Sent ONLY for a genuinely local run -- omitting it (the
          // pre-Task-6 default, and still the default for every project
          // with no compatible target area) is what makes Trends Explore
          // return worldwide interest, its own documented behavior.
          // Sending the session's own country code here would silently
          // narrow every existing worldwide result to that country, a
          // real behavior change this task must not make.
          locationCode:
            runGeo?.scope === "local" ? runGeo.locationCode : undefined,
          languageCode: runGeo?.languageCode,
          // Defect 1 fix: sent purely so the server can persist it in this
          // run's history -- never read back to decide anything about THIS
          // request, which is already fully determined by the two fields
          // above.
          geo:
            runGeo && runGeoCountryCode != null
              ? {
                  v: STORED_GEO_BUNDLE_VERSION,
                  interest: toStoredMetricGeo(runGeo, runGeoCountryCode),
                }
              : undefined,
        },
      }),
  });

  const errorMessage = trendsQuery.isError
    ? describeGeoRunError(
        "trend data",
        runGeo ?? { scope: "national", label: "" },
        getStandardErrorMessage(trendsQuery.error),
      )
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
  // Defect 1 fix: a restored run's OWN persisted geo bundle -- null for a
  // run recorded before this bundle existed, which must read as "geography
  // unknown" (bare "Interest", same as no geo at all) rather than guessing
  // it was worldwide or national. `runGeo` (a live/just-re-run capture)
  // always wins when both exist, matching `result`'s own `??` precedence.
  const restoredGeo =
    parseStoredGeo(trendsGeoBundleSchema, restoredRun?.params)?.interest ??
    null;
  const effectiveGeo = runGeo ?? restoredGeo;
  const seriesByKeyword = useMemo(
    () =>
      toSeriesByKeyword(
        result ? computeMonthlyInterest(result.keywords, result.points) : null,
      ),
    [result],
  );

  return (
    <AppPageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Activity className="size-6" />
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

      <TrendingOpportunitiesCard projectId={projectId} />

      <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
        <div className="flex flex-auto flex-col gap-3 p-4 text-sm">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
            onSubmit={(event) => {
              event.preventDefault();
              const next = parseKeywords(input);
              if (next.length === 0) return;
              // Captured HERE, at authorize()-time -- never recomputed from
              // live scope afterward.
              setRunGeo(
                captureTrendsRunGeo(targetAreaScope.area, market.locationCode),
              );
              setRunGeoCountryCode(market.locationCode);
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
                <span className="pb-1 text-xs font-medium">
                  Keywords (comma-separated, up to {MAX_TRENDS_KEYWORDS})
                </span>
                <Input
                  passwordManagerIgnore
                  type="text"
                  size="sm"
                  className="w-full"
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
        <Banner variant="error" className="text-sm">
          {errorMessage}
        </Banner>
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
            // A genuine new user-authorized run, so it captures the CURRENT
            // live scope -- trendsResultSchema stores no locationCode of its
            // own to fall back to (unlike SERP Overview's stored result).
            setRunGeo(
              captureTrendsRunGeo(targetAreaScope.area, market.locationCode),
            );
            setRunGeoCountryCode(market.locationCode);
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

      <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
        <div className="flex flex-auto flex-col p-4 gap-2 text-sm">
          {runKeywords == null && !restoredRun ? (
            <div className="px-4 py-12 text-center text-sm text-base-content/60">
              {enteredKeywords.length > 0
                ? "Keywords are prefilled. Click Compare to fetch paid trend data."
                : "Enter keywords above to chart their Google Trends interest."}
            </div>
          ) : trendsQuery.isFetching && !result ? (
            <div className="flex items-center justify-center py-16">
              <Loader />
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
              geoLabel={trendsMetricLabel(effectiveGeo)}
            />
          )}
        </div>
      </div>

      {result && result.points.length > 0 ? (
        <NextStepsCard
          verdict={buildTrendsVerdict({
            keywords: result.keywords,
            seriesByKeyword,
            areaLabel:
              effectiveGeo?.scope === "local" ? effectiveGeo.label : null,
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
    </AppPageShell>
  );
}

/** `date` is the bucket's `date_from` ("2026-01-04"), which parses to the same
 *  instant as the `timestamp` the Recharts axis used, so both the axis and the
 *  tooltip read exactly as they did before. */
function formatTrendDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", options);
}

function TrendsChart({
  keywords,
  averages,
  points,
  geoLabel,
}: {
  keywords: string[];
  averages: (number | null)[];
  points: Array<{ timestamp: number; date: string; values: (number | null)[] }>;
  /** From `trendsMetricLabel` -- only ever "Interest · <area>" for a
   *  genuinely local run; bare "Interest" (rendered as nothing extra here)
   *  for the worldwide default, matching this chart's pre-Task-6 look. */
  geoLabel: string;
}) {
  const theme = useChartTheme();
  const base = useChartBase(theme);
  const height = 288;
  const showGeoLabel = geoLabel !== "Interest";

  const { dates, series } = useMemo(
    () => ({
      dates: points.map((point) => point.date),
      series: keywords.map((keyword, index) => ({
        type: "line" as const,
        name: keyword,
        data: points.map((point) => point.values[index] ?? null),
        smooth: true,
        // `showSymbol: false` rather than `symbol: "none"`: the Recharts line
        // drew no dots but did draw one on the hovered point (`activeDot`),
        // and only this form keeps that marker.
        showSymbol: false,
        symbolSize: 8,
        // A gap in one keyword's history stays a gap, as before.
        connectNulls: false,
        lineStyle: { width: 2, color: SERIES_COLORS[index] },
        itemStyle: { color: SERIES_COLORS[index] },
      })),
    }),
    [keywords, points],
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
          const rows = tooltipRows(params);
          const [first] = rows;
          if (!first) return "";
          return [
            `<div style="font-size:12px;font-weight:500;padding-bottom:2px">${formatTrendDate(
              first.axisValue,
              { month: "short", day: "numeric", year: "numeric" },
            )}</div>`,
            ...rows.map(
              (row) =>
                `<div style="display:flex;align-items:center;gap:6px;font-size:12px">` +
                `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${row.color}"></span>` +
                `${escapeHtml(row.seriesName)}: ${row.value ?? "—"}</div>`,
            ),
          ].join("");
        },
      },
      xAxis: {
        ...base.axisCommon,
        // A category axis, not a time axis: Google Trends returns evenly
        // spaced buckets keyed by their start date, so the string IS the
        // bucket and placing them by elapsed time would only add rounding.
        type: "category" as const,
        data: dates,
        boundaryGap: false,
        axisLabel: {
          ...base.axisCommon.axisLabel,
          formatter: (value: string) =>
            formatTrendDate(value, { month: "short", year: "2-digit" }),
          // ECharts' own overlap avoidance replaces Recharts' minTickGap: it
          // drops labels that would collide rather than taking a pixel budget.
          hideOverlap: true,
        },
      },
      yAxis: {
        ...base.axisCommon,
        type: "value" as const,
        // Google Trends interest is always 0-100, and pinning the axis keeps a
        // calm series from being auto-zoomed into looking volatile.
        min: 0,
        max: 100,
        minInterval: 1,
      },
      series,
    }),
    [base, dates, series],
  );

  return (
    <div className="space-y-3">
      {showGeoLabel ? (
        <p className="text-xs text-base-content/50">{geoLabel}</p>
      ) : null}
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
      <Chart
        echarts={echarts}
        options={options}
        height={height}
        isDarkMode={theme.isDark}
        className="w-full min-w-0"
      />
      <p className="text-xs text-base-content/50">
        Interest is relative to the peak (100) across the selected keywords and
        time range — it is not absolute search volume.
      </p>
    </div>
  );
}
