import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { TablePagination } from "@/client/components/table/TablePagination";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getProjects } from "@/serverFunctions/projects";
import {
  DEFAULT_COMPETITORS_PAGE_SIZE,
  DEFAULT_KEYWORD_GAP_PAGE_SIZE,
  keywordGapModes,
  type CompetitorsTab,
  type KeywordGapMode,
} from "@/types/schemas/competitors";
import { CompetitorsTable } from "./CompetitorsTable";
import { KeywordGapTable } from "./KeywordGapTable";
import {
  useCompetitorsQuery,
  useKeywordGapQuery,
} from "./useCompetitorsQueries";

type CompetitorsSearchState = {
  target: string;
  competitor: string;
  tab: CompetitorsTab;
  mode: KeywordGapMode;
  page: number;
};

type CompetitorsNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

const GAP_MODE_LABELS: Record<KeywordGapMode, string> = {
  missing: "Missing (they rank, you don't)",
  shared: "Shared (you both rank)",
  advantage: "Advantage (you rank, they don't)",
};

export function CompetitorsPage({
  projectId,
  navigate,
  searchState,
}: {
  projectId: string;
  navigate: CompetitorsNavigate;
  searchState: CompetitorsSearchState;
}) {
  const { target, competitor, tab, mode, page } = searchState;

  const [targetInput, setTargetInput] = useState(target);
  const [competitorInput, setCompetitorInput] = useState(competitor);

  // Keep inputs in sync when the URL changes (e.g. via a table row action).
  useEffect(() => setTargetInput(target), [target]);
  useEffect(() => setCompetitorInput(competitor), [competitor]);

  // Prefill the target with the project's own domain on first visit.
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 60_000,
  });
  const projectDomain =
    projectsQuery.data?.find((project) => project.id === projectId)?.domain ??
    "";
  useEffect(() => {
    if (!target && !targetInput && projectDomain) {
      setTargetInput(projectDomain);
    }
    // Only prefill while the field is empty; never clobber user input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDomain]);

  const updateSearch = (update: Partial<CompetitorsSearchState>) => {
    navigate({
      search: (previous) => ({ ...previous, ...update }),
      replace: false,
    });
  };

  const submit = () => {
    const nextTarget = targetInput.trim();
    if (!nextTarget) return;
    updateSearch({
      target: nextTarget,
      competitor: competitorInput.trim(),
      page: 1,
    });
  };

  const competitorsQuery = useCompetitorsQuery({
    projectId,
    target,
    page: tab === "competitors" ? page : 1,
    pageSize: DEFAULT_COMPETITORS_PAGE_SIZE,
    enabled: tab === "competitors",
  });

  const gapQuery = useKeywordGapQuery({
    projectId,
    target,
    competitor,
    mode,
    page: tab === "gap" ? page : 1,
    pageSize: DEFAULT_KEYWORD_GAP_PAGE_SIZE,
    enabled: tab === "gap",
  });

  const activeQuery = tab === "competitors" ? competitorsQuery : gapQuery;
  const errorMessage = activeQuery.isError
    ? getStandardErrorMessage(activeQuery.error)
    : null;

  const compareCompetitor = (domain: string) => {
    updateSearch({ tab: "gap", competitor: domain, mode: "missing", page: 1 });
  };

  const gapReady = target !== "" && competitor !== "";
  const pageSize =
    tab === "competitors"
      ? DEFAULT_COMPETITORS_PAGE_SIZE
      : DEFAULT_KEYWORD_GAP_PAGE_SIZE;
  const totalCount =
    (tab === "competitors"
      ? competitorsQuery.data?.totalCount
      : gapQuery.data?.totalCount) ?? null;
  const rowsOnPage =
    (tab === "competitors"
      ? competitorsQuery.data?.rows.length
      : gapQuery.data?.rows.length) ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Users className="size-5" />
          Competitor Insights
        </h1>
        <p className="text-sm text-base-content/60">
          Discover who you compete with in organic search and find the keywords
          they rank for that you don&apos;t.
        </p>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="form-control w-full sm:max-w-xs">
              <span className="label-text pb-1 text-xs font-medium">
                Your domain
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="example.com"
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
              />
            </label>
            {tab === "gap" ? (
              <label className="form-control w-full sm:max-w-xs">
                <span className="label-text pb-1 text-xs font-medium">
                  Competitor domain
                </span>
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  placeholder="competitor.com"
                  value={competitorInput}
                  onChange={(event) => setCompetitorInput(event.target.value)}
                />
              </label>
            ) : null}
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={
                !targetInput.trim() ||
                (tab === "gap" && !competitorInput.trim()) ||
                activeQuery.isFetching
              }
            >
              {activeQuery.isFetching ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Search className="size-3.5" />
              )}
              Analyze
            </button>
          </form>

          {tab === "gap" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-base-content/60">Show</span>
              {keywordGapModes.map((gapMode) => (
                <button
                  key={gapMode}
                  type="button"
                  className={`btn btn-xs ${mode === gapMode ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => updateSearch({ mode: gapMode, page: 1 })}
                >
                  {GAP_MODE_LABELS[gapMode]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert-error text-sm">{errorMessage}</div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
        <div className="border-b border-base-300 px-4 py-3">
          <div role="tablist" className="tabs tabs-border w-fit">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "competitors"}
              className={`tab ${tab === "competitors" ? "tab-active" : ""}`}
              onClick={() => updateSearch({ tab: "competitors", page: 1 })}
            >
              Competitors
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "gap"}
              className={`tab ${tab === "gap" ? "tab-active" : ""}`}
              onClick={() => updateSearch({ tab: "gap", page: 1 })}
            >
              Keyword Gap
            </button>
          </div>
        </div>

        {tab === "competitors" ? (
          target === "" ? (
            <EmptyState message="Enter your domain and hit Analyze to discover organic competitors." />
          ) : (
            <CompetitorsTable
              rows={competitorsQuery.data?.rows ?? []}
              onCompareCompetitor={compareCompetitor}
            />
          )
        ) : !gapReady ? (
          <EmptyState message="Enter your domain and a competitor domain to compare keyword profiles." />
        ) : (
          <KeywordGapTable
            rows={gapQuery.data?.rows ?? []}
            targetLabel={target}
            competitorLabel={competitor}
          />
        )}

        {rowsOnPage > 0 || page > 1 ? (
          <TablePagination
            page={page}
            pageSize={pageSize}
            pageSizes={[pageSize]}
            totalCount={totalCount}
            hasNextPage={rowsOnPage === pageSize}
            isLoading={activeQuery.isFetching}
            onPageChange={(nextPage) => updateSearch({ page: nextPage })}
            onPageSizeChange={() => {}}
          />
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-12 text-center text-sm text-base-content/60">
      {message}
    </div>
  );
}
