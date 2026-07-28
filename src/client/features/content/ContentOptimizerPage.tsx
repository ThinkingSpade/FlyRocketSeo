/* eslint-disable max-lines, max-lines-per-function -- Content Optimizer keeps its brief and separately-authorized outline workflow together. */
import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { NotebookPen, Search } from "lucide-react";
import { BriefTargets, quantile } from "@/client/features/content/BriefTargets";
import { ContentEmptyState } from "@/client/features/content/ContentEmptyState";
import { useContentBriefHistory } from "@/client/features/content/useContentBriefHistory";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  analyzeContentCompetitor,
  getContentBrief,
} from "@/serverFunctions/content";
import { contentBriefSchema } from "@/types/schemas/content";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoreRail } from "@/client/features/analysis-runs/RestoreRail";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";
import { CompetitorOutlines } from "@/client/features/content/CompetitorOutlines";
import { DraftGrader } from "@/client/features/content/DraftGrader";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { useProjectMarket } from "@/client/hooks/useProjectDomain";
import { ScopeControl } from "@/client/features/geo/ScopeControl";
import { TargetAreaBanner } from "@/client/features/geo/TargetAreaBanner";
import {
  useTargetAreaScope,
  type TargetAreaScope,
} from "@/client/features/geo/useTargetAreaScope";
import { useProjectSuggestions } from "@/client/features/insights/useProjectSuggestions";
import { useLastRunInput } from "@/client/features/insights/useLastRunInput";
import { resolvePrefill } from "@/client/features/insights/resolvePrefill";
import {
  useHandoff,
  writeHandoff,
} from "@/client/features/insights/handoffStore";
import { SuggestionChips } from "@/client/features/insights/SuggestionChips";

type ContentNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

type CompetitorAnalysis = {
  url: string;
  title: string;
  wordCount: number | null;
  h2: string[];
  h3: string[];
} | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The `extract` this tab hands to `useLastRunInput`: pulls `keyword` off the
 * stored content-brief result. A shape that has drifted (or isn't this
 * feature's result at all) returns null rather than throwing — the tab
 * simply has no last-run value to offer, same contract as the hook itself.
 */
function extractStoredKeyword(result: unknown): string | null {
  if (!isRecord(result)) return null;
  return typeof result.keyword === "string" ? result.keyword : null;
}

/**
 * The submit button, paired with an invisible copy of the "Target keyword"/
 * "Location" label row above it. The form aligns its columns with
 * `items-start` so the keyword column's chips (rendered after the input) can
 * never drag the other columns down -- but that only works if every column
 * starts with the same label-row height. This column has no real label, so
 * the phantom one here lands the button's own control at the input's
 * y-offset instead of flush with the "Target keyword"/"Location" text.
 * `hidden`/`sm:block` keeps it out of the stacked mobile layout, where
 * nothing pushes the button down and this spacer would only add dead space.
 */
function BuildBriefButton({
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
        Build brief
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
        Build brief
      </button>
    </div>
  );
}

export function ContentOptimizerPage({
  projectId,
  navigate,
  query,
  locationCode,
}: {
  projectId: string;
  navigate: ContentNavigate;
  query: string;
  locationCode: number | undefined;
}) {
  const market = useProjectMarket(projectId);
  // The URL's own `loc` param always wins; the project's configured market
  // only fills in for a tab opened with no location in the URL at all.
  const activeLocation = locationCode ?? market.locationCode;
  // The header ScopeControl's own state -- a SEPARATE concept from the
  // country-only `locationInput` field below, which stays untouched here.
  // Must never be read into `run`'s key or `briefQuery`'s queryKey; wiring
  // the chosen area into the actual fetch is Task 6's job.
  const targetAreaScope = useTargetAreaScope(projectId, activeLocation);

  const suggestions = useProjectSuggestions(projectId, "under-clicked");
  const handoff = useHandoff(projectId);
  // This page already imports RUN_FEATURES for its RestoreRail; reuse the
  // same feature key so both read one cache entry.
  const lastRun = useLastRunInput(
    projectId,
    RUN_FEATURES.contentBrief,
    extractStoredKeyword,
  );

  // The URL param wins, then a keyword carried from another tab, then what
  // this tab last ran, then the under-clicked ranking. Resolved only for the
  // field's initial value — after that the user owns the input.
  const prefill = resolvePrefill({
    kind: "keyword",
    searchParam: query,
    handoff,
    lastRun,
    suggestions,
    projectDefault: null,
  });

  const [input, setInput] = useState(query);
  const [locationInput, setLocationInput] = useState(String(activeLocation));
  const [inputTouched, setInputTouched] = useState(false);
  const [locationTouched, setLocationTouched] = useState(false);

  // Every prefill source above resolves after first paint, so the `useState`
  // initializer can never see it. Seed the field once a value lands, but
  // never fight the user: bail as soon as they've typed or picked a chip
  // (inputTouched), and even before that, bail if the field is non-empty.
  useEffect(() => {
    if (inputTouched) return;
    if (input.trim() !== "") return;
    if (prefill.value === "") return;
    setInput(prefill.value);
  }, [inputTouched, input, prefill.value]);

  // `activeLocation` has the same deferred-arrival problem as the keyword
  // prefill above, and it's worse here: on a cold load (hard refresh,
  // bookmark, shared link) the `["projects"]` query behind `useProjectMarket`
  // hasn't resolved on first render, so `activeLocation` reads the US
  // fallback and `locationInput` locks onto it via the `useState` initializer.
  // Without this effect the select would silently keep showing "United
  // States" even after the project's real market arrives a render later --
  // and the metered lookup below bills a wrong-country analysis with no
  // error and no visual cue. Bail on an explicit `loc` URL param (it already
  // won at first paint, synchronously -- there's nothing to re-sync) and on
  // a location the user picked themselves (locationTouched), so precedence
  // stays URL param > user selection > project market > US fallback.
  // Depending on the primitive `activeLocation` (not the `market` object)
  // keeps this from re-running every render: an unstable object dependency
  // has caused a real render loop in this codebase before.
  useEffect(() => {
    if (locationCode != null) return;
    if (locationTouched) return;
    setLocationInput(String(activeLocation));
  }, [locationCode, locationTouched, activeLocation]);

  const [runInput, setRunInput] = useState<{
    keyword: string;
    locationCode: number;
  } | null>(null);
  const [competitorsAuthorized, setCompetitorsAuthorized] = useState(false);
  const run = useAuthorizedRun(
    createMeteredRunKey(projectId, input.trim(), Number(locationInput)),
  );
  const { history, historyLoaded, addBrief, removeBrief } =
    useContentBriefHistory(projectId);

  const briefQuery = useMeteredQuery({
    authorized: run.authorized,
    runNonce: run.runNonce,
    enabled: runInput != null,
    queryKey: ["content-brief", projectId, runInput],
    queryFn: () =>
      getContentBrief({
        data: {
          projectId,
          keyword: runInput?.keyword ?? "",
          locationCode: runInput?.locationCode ?? activeLocation,
        },
      }),
  });
  // Restoring the project's last brief is free: it reads a stored row plus the
  // R2 object that run already paid for, never a metered fetch.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.contentBrief,
    schema: contentBriefSchema,
    enabled: runInput == null,
    runId: selectedRunId,
  });
  const brief = briefQuery.data ?? restored?.result;
  const restoredRun = briefQuery.data == null ? restored : null;
  const errorMessage = briefQuery.isError
    ? getStandardErrorMessage(briefQuery.error)
    : null;

  // Remember successful briefs so the empty state can relink them. Keyed on
  // the brief's identity, not the callback: addBrief changes identity with
  // every history write, and each write re-stamps the item — depending on it
  // would loop the effect forever.
  const briefKeyword = brief?.keyword;
  const briefLocationCode = brief?.locationCode;
  useEffect(() => {
    if (briefKeyword != null && briefLocationCode != null) {
      addBrief({ keyword: briefKeyword, locationCode: briefLocationCode });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefKeyword, briefLocationCode]);

  // One analysis call per competitor page — each is its own Worker invocation
  // (CPU-bounded) and is cached server-side for a week.
  // Deliberately keyed off the LIVE brief, never the restored one: each URL
  // here becomes its own metered analyzeContentCompetitor call, so restoring a
  // brief with ten competitors would turn a free page load into ten paid ones.
  // Outlines wait for "Run again".
  const competitorUrls = (briefQuery.data?.competitors ?? [])
    .map((competitor) => competitor.url)
    .filter((url): url is string => Boolean(url));
  const analysisQueries = useQueries({
    queries: competitorUrls.map((url) => ({
      queryKey: ["content-competitor", projectId, url],
      queryFn: async (): Promise<CompetitorAnalysis> =>
        analyzeContentCompetitor({ data: { projectId, url } }),
      enabled: competitorsAuthorized,
      staleTime: Infinity,
      gcTime: 60 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 1,
    })),
  });
  const analysisByUrl = new Map<string, CompetitorAnalysis>();
  competitorUrls.forEach((url, index) => {
    const data = analysisQueries[index]?.data;
    if (data !== undefined) analysisByUrl.set(url, data);
  });
  const loadedAnalyses = [...analysisByUrl.values()].filter(
    (analysis): analysis is NonNullable<CompetitorAnalysis> => analysis != null,
  );
  const analysesPending = analysisQueries.some((query_) => query_.isLoading);

  const wordCounts = loadedAnalyses
    .map((analysis) => analysis.wordCount)
    .filter((count): count is number => count != null && count > 0)
    .toSorted((a, b) => a - b);
  const h2Counts = loadedAnalyses
    .map((analysis) => analysis.h2.length)
    .toSorted((a, b) => a - b);
  // Read once and threaded into both BriefTargets and DraftGrader's verdict
  // below, so the two can never disagree on what "the target" is.
  const targetWordCount =
    wordCounts.length > 0 ? quantile(wordCounts, 0.5) : null;

  const headingIdeas = [
    ...new Set(
      loadedAnalyses.flatMap((analysis) => analysis.h2.map((h) => h.trim())),
    ),
  ]
    .filter(Boolean)
    .slice(0, 30);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <ContentOptimizerHeading scope={targetAreaScope} />
      <TargetAreaBanner projectId={projectId} />

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
            onSubmit={(event) => {
              event.preventDefault();
              const next = input.trim();
              if (!next) return;
              setCompetitorsAuthorized(false);
              setRunInput({
                keyword: next,
                locationCode: Number(locationInput),
              });
              run.authorize();
              writeHandoff(projectId, {
                kind: "keyword",
                value: next,
                locationCode: Number(locationInput),
                source: "Content Optimizer",
                at: Date.now(),
              });
              navigate({
                search: (prev) => ({
                  ...prev,
                  q: next,
                  loc: Number(locationInput),
                }),
                replace: false,
              });
            }}
          >
            <div className="flex w-full flex-col gap-1.5 sm:max-w-md">
              <label className="form-control w-full">
                <span className="label-text pb-1 text-xs font-medium">
                  Target keyword
                </span>
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  placeholder="office coffee service dallas"
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
                  setInput(next);
                }}
                disabled={briefQuery.isFetching}
              />
            </div>
            <label className="form-control w-full sm:max-w-56">
              <span className="label-text pb-1 text-xs font-medium">
                Location
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={locationInput}
                onChange={(event) => {
                  setLocationTouched(true);
                  setLocationInput(event.target.value);
                }}
              >
                {LOCATION_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <BuildBriefButton
              disabled={!input.trim() || briefQuery.isFetching}
              isFetching={briefQuery.isFetching}
            />
          </form>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-error text-sm">{errorMessage}</div>
      ) : null}

      <RestoreRail
        projectId={projectId}
        feature={RUN_FEATURES.contentBrief}
        selectedRunId={selectedRunId}
        onSelectRun={setSelectedRunId}
        idle={runInput == null}
        restoredRun={restoredRun}
        onRunAgain={() => {
          if (!restoredRun) return;
          setInput(restoredRun.result.keyword);
          setLocationInput(String(restoredRun.result.locationCode));
          setCompetitorsAuthorized(false);
          setRunInput({
            keyword: restoredRun.result.keyword,
            locationCode: restoredRun.result.locationCode,
          });
          run.authorize(
            createMeteredRunKey(
              projectId,
              restoredRun.result.keyword,
              restoredRun.result.locationCode,
            ),
          );
          navigate({
            search: (prev) => ({
              ...prev,
              q: restoredRun.result.keyword,
              loc: restoredRun.result.locationCode,
            }),
            replace: false,
          });
        }}
      />

      {runInput == null && !restoredRun ? (
        <ContentEmptyState
          history={history}
          historyLoaded={historyLoaded}
          onOpenBrief={(item) => {
            setInput(item.keyword);
            setLocationInput(String(item.locationCode));
            navigate({
              search: (prev) => ({
                ...prev,
                q: item.keyword,
                loc: item.locationCode,
              }),
              replace: false,
            });
          }}
          onRemoveBrief={removeBrief}
        />
      ) : null}

      {runInput != null && briefQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : null}

      {brief ? (
        <>
          {competitorUrls.length > 0 && !competitorsAuthorized ? (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body flex-row items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="text-sm font-semibold">
                    Competitor outlines are a separate paid analysis
                  </h2>
                  <p className="text-xs text-base-content/60">
                    Analyze {competitorUrls.length} ranking pages for word
                    counts and heading outlines.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setCompetitorsAuthorized(true)}
                >
                  Analyze competitor outlines
                </button>
              </div>
            </div>
          ) : null}

          <BriefTargets
            wordCounts={wordCounts}
            h2Counts={h2Counts}
            analyzedCount={loadedAnalyses.length}
            paaCount={brief.paaQuestions.length}
            analysesPending={analysesPending}
          />

          {brief.terms.length > 0 ? (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body gap-2 p-4">
                <h2 className="text-sm font-semibold">Terms to include</h2>
                <div className="flex flex-wrap gap-1.5">
                  {brief.terms.map((term) => (
                    <span key={term.keyword} className="badge badge-ghost">
                      {term.keyword}
                      {term.searchVolume != null ? (
                        <span className="ml-1 text-base-content/50 tabular-nums">
                          {term.searchVolume.toLocaleString()}
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {brief.paaQuestions.length > 0 ? (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body gap-2 p-4">
                <h2 className="text-sm font-semibold">Questions to answer</h2>
                <ul className="list-inside list-disc space-y-1 text-sm text-base-content/80">
                  {brief.paaQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {headingIdeas.length > 0 ? (
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body gap-2 p-4">
                <h2 className="text-sm font-semibold">
                  Subtopics the top pages cover
                </h2>
                <ul className="grid gap-x-6 gap-y-1 text-sm text-base-content/80 sm:grid-cols-2">
                  {headingIdeas.map((heading) => (
                    <li key={heading} className="list-inside list-disc">
                      {heading}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="card border border-base-300 bg-base-100">
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-14">#</th>
                    <th>Ranking page</th>
                    <th className="text-right">Words</th>
                    <th className="text-right">H2s</th>
                  </tr>
                </thead>
                <tbody>
                  {brief.competitors.map((competitor) => {
                    const analysis = competitor.url
                      ? analysisByUrl.get(competitor.url)
                      : undefined;
                    return (
                      <tr key={`${competitor.rank}-${competitor.url}`}>
                        <td className="align-top tabular-nums">
                          {competitor.rank ?? "—"}
                        </td>
                        <td className="max-w-xl align-top">
                          <a
                            href={competitor.url ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-1 font-medium hover:underline"
                          >
                            {competitor.title ?? competitor.url ?? "—"}
                          </a>
                          <div className="line-clamp-1 text-xs text-success/80">
                            {competitor.url}
                          </div>
                        </td>
                        <td className="text-right align-top tabular-nums">
                          {competitorsAuthorized && analysis === undefined ? (
                            <span className="loading loading-dots loading-xs" />
                          ) : analysis?.wordCount != null ? (
                            analysis.wordCount.toLocaleString()
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="text-right align-top tabular-nums">
                          {competitorsAuthorized && analysis === undefined ? (
                            <span className="loading loading-dots loading-xs" />
                          ) : (
                            (analysis?.h2.length ?? "—")
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <CompetitorOutlines analyses={loadedAnalyses} />

          <DraftGrader
            projectId={projectId}
            keyword={brief.keyword}
            targetWordCount={targetWordCount}
            terms={brief.terms}
            questions={brief.paaQuestions}
            outlines={loadedAnalyses.map((analysis) => analysis.h2)}
          />

          <p className="text-xs text-base-content/40">
            Brief for &ldquo;{brief.keyword}&rdquo; · fetched{" "}
            {new Date(brief.fetchedAt).toLocaleString()}
          </p>
        </>
      ) : null}
    </div>
  );
}

function ContentOptimizerHeading({ scope }: { scope: TargetAreaScope }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <NotebookPen className="size-5" />
          Content Optimizer
        </h1>
        <p className="text-sm text-base-content/60">
          Build a data-backed content brief from the pages that actually rank:
          target length, subtopics to cover, terms to include, and the questions
          searchers ask.
        </p>
      </div>
      <ScopeControl area={scope.area} onChange={scope.onChange} />
    </div>
  );
}
