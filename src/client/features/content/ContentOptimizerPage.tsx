import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { NotebookPen, Search } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  analyzeContentCompetitor,
  getContentBrief,
} from "@/serverFunctions/content";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";
import { CompetitorOutlines } from "@/client/features/content/CompetitorOutlines";
import { DraftGrader } from "@/client/features/content/DraftGrader";

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

function BriefTargets({
  wordCounts,
  h2Counts,
  analyzedCount,
  paaCount,
  analysesPending,
}: {
  wordCounts: number[];
  h2Counts: number[];
  analyzedCount: number;
  paaCount: number;
  analysesPending: boolean;
}) {
  const pendingLabel = analysesPending ? "Analyzing top pages…" : "No data";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-base-content/50">
            Target length
          </span>
          {wordCounts.length > 0 ? (
            <>
              <span className="text-2xl font-semibold tabular-nums">
                ~{quantile(wordCounts, 0.5).toLocaleString()} words
              </span>
              <span className="text-xs text-base-content/60">
                Top pages range {quantile(wordCounts, 0.25).toLocaleString()}–
                {quantile(wordCounts, 0.75).toLocaleString()}
              </span>
            </>
          ) : (
            <span className="text-sm text-base-content/50">{pendingLabel}</span>
          )}
        </div>
      </div>
      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-base-content/50">
            Structure
          </span>
          {h2Counts.length > 0 ? (
            <>
              <span className="text-2xl font-semibold tabular-nums">
                ~{quantile(h2Counts, 0.5)} H2 sections
              </span>
              <span className="text-xs text-base-content/60">
                Based on {analyzedCount} analyzed top pages
              </span>
            </>
          ) : (
            <span className="text-sm text-base-content/50">{pendingLabel}</span>
          )}
        </div>
      </div>
      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-base-content/50">
            Questions to answer
          </span>
          <span className="text-2xl font-semibold tabular-nums">
            {paaCount}
          </span>
          <span className="text-xs text-base-content/60">
            From People-Also-Ask on this SERP
          </span>
        </div>
      </div>
    </div>
  );
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next != null
    ? Math.round(sorted[base] + rest * (next - sorted[base]))
    : Math.round(sorted[base]);
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
  const activeLocation = locationCode ?? DEFAULT_LOCATION_CODE;
  const [input, setInput] = useState(query);
  const [locationInput, setLocationInput] = useState(String(activeLocation));
  const keyword = query.trim();

  const briefQuery = useQuery({
    enabled: keyword.length > 0,
    queryKey: ["content-brief", projectId, keyword, activeLocation],
    queryFn: () =>
      getContentBrief({
        data: { projectId, keyword, locationCode: activeLocation },
      }),
    staleTime: 30 * 60_000,
  });
  const brief = briefQuery.data;
  const errorMessage = briefQuery.isError
    ? getStandardErrorMessage(briefQuery.error)
    : null;

  // One analysis call per competitor page — each is its own Worker invocation
  // (CPU-bounded) and is cached server-side for a week.
  const competitorUrls = (brief?.competitors ?? [])
    .map((competitor) => competitor.url)
    .filter((url): url is string => Boolean(url));
  const analysisQueries = useQueries({
    queries: competitorUrls.map((url) => ({
      queryKey: ["content-competitor", projectId, url],
      queryFn: async (): Promise<CompetitorAnalysis> =>
        analyzeContentCompetitor({ data: { projectId, url } }),
      staleTime: 60 * 60_000,
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

  const headingIdeas = [
    ...new Set(
      loadedAnalyses.flatMap((analysis) => analysis.h2.map((h) => h.trim())),
    ),
  ]
    .filter(Boolean)
    .slice(0, 30);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
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

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const next = input.trim();
              if (!next) return;
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
            <label className="form-control w-full sm:max-w-md">
              <span className="label-text pb-1 text-xs font-medium">
                Target keyword
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="office vending machines dallas"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <label className="form-control w-full sm:max-w-56">
              <span className="label-text pb-1 text-xs font-medium">
                Location
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={locationInput}
                onChange={(event) => setLocationInput(event.target.value)}
              >
                {LOCATION_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!input.trim() || briefQuery.isFetching}
            >
              {briefQuery.isFetching ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Search className="size-3.5" />
              )}
              Build brief
            </button>
          </form>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-error text-sm">{errorMessage}</div>
      ) : null}

      {!keyword ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-12 text-center">
            <p className="font-medium">Enter a keyword to build a brief</p>
            <p className="max-w-md text-sm text-base-content/60">
              The optimizer reads the current top-ranking pages and turns them
              into a concrete writing target.
            </p>
          </div>
        </div>
      ) : null}

      {keyword && briefQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : null}

      {brief ? (
        <>
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
                          {analysis === undefined ? (
                            <span className="loading loading-dots loading-xs" />
                          ) : analysis?.wordCount != null ? (
                            analysis.wordCount.toLocaleString()
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="text-right align-top tabular-nums">
                          {analysis === undefined ? (
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
