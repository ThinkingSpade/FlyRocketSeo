import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { DataFreshness } from "@/client/components/DataFreshness";
import { TablePagination } from "@/client/components/table/TablePagination";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  DEFAULT_COMPETITORS_PAGE_SIZE,
  DEFAULT_KEYWORD_GAP_PAGE_SIZE,
  DEFAULT_LINK_GAP_PAGE_SIZE,
  competitorsPageSchema,
  keywordGapModes,
  type CompetitorsTab,
  type KeywordGapMode,
} from "@/types/schemas/competitors";
import { AnalyzeDomainPrompt } from "@/client/components/AnalyzeDomainPrompt";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import { CompetitorsSearchForm } from "./CompetitorsSearchForm";
import { TabBody } from "./CompetitorsTabBody";
import { CompetitorsOverviewExtras } from "./CompetitorsOverviewExtras";
import { KeywordGapOverview } from "./KeywordGapOverview";
import {
  useCompetitorsQuery,
  useCompetitorsRun,
  useCompetitorsTargetPrefill,
  useKeywordGapQuery,
  useLinkGapQuery,
} from "./useCompetitorsQueries";
import { buildCompetitorsAuthorizationKey } from "./competitorsAuthorization";
import { writeHandoff } from "@/client/features/insights/handoffStore";
import {
  COMPETITORS_ANALYZE_PREVIEW,
  COMPETITORS_TABS,
  GAP_MODE_LABELS,
  TAB_PAGE_SIZES,
} from "./competitorsPageContent";
import { AppPageShell } from "@/client/components/AppPageShell";

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
  // `useCompetitorsRun` captures the project's market into state at the
  // moment a run is authorized rather than reading it live -- see its own
  // doc comment for why that matters for billing safety.
  const run = useCompetitorsRun(
    projectId,
    buildCompetitorsAuthorizationKey(projectId, searchState),
  );
  const { authorized, market } = run;
  // Keep inputs in sync when the URL changes (e.g. via a table row action).
  useEffect(() => setTargetInput(target), [target]);
  useEffect(() => setCompetitorInput(competitor), [competitor]);
  const projectDomain = useProjectDomain(projectId);
  // With no target in the URL the competitors query below stays disabled, so
  // the tab would otherwise show nothing but a prompt. Restoring the
  // project's last run fills it in for free: it reads a stored row plus the
  // R2 object that run already paid for, and can never trigger a metered
  // fetch. Declared before `useCompetitorsTargetPrefill` so its `label` can
  // feed that hook's last-run prefill tier.
  //
  // Only the competitor list restores. Keyword gap and link gap need a chosen
  // competitor and are separately metered, so they stay on demand.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.competitors,
    schema: competitorsPageSchema,
    enabled: target.trim() === "" && tab === "competitors",
    runId: selectedRunId,
  });
  useCompetitorsTargetPrefill({
    projectId,
    target,
    targetInput,
    setTargetInput,
    projectDomain,
    lastRun: restored?.label ?? null,
  });

  const updateSearch = (update: Partial<CompetitorsSearchState>) => {
    navigate({
      search: (previous) => ({ ...previous, ...update }),
      replace: false,
    });
  };

  const competitorsQuery = useCompetitorsQuery({
    projectId,
    target,
    page: tab === "competitors" ? page : 1,
    pageSize: DEFAULT_COMPETITORS_PAGE_SIZE,
    locationCode: market.locationCode,
    languageCode: market.languageCode,
    enabled: tab === "competitors",
    authorized,
    runNonce: run.runNonce,
  });
  const restoredRun = competitorsQuery.data == null ? restored : null;
  const competitorRows =
    competitorsQuery.data?.rows ?? restored?.result.rows ?? [];
  const gapQuery = useKeywordGapQuery({
    projectId,
    target,
    competitor,
    mode,
    page: tab === "gap" ? page : 1,
    pageSize: DEFAULT_KEYWORD_GAP_PAGE_SIZE,
    locationCode: market.locationCode,
    languageCode: market.languageCode,
    enabled: tab === "gap",
    authorized,
    runNonce: run.runNonce,
  });
  const linkGapQuery = useLinkGapQuery({
    projectId,
    target,
    competitor,
    page: tab === "links" ? page : 1,
    pageSize: DEFAULT_LINK_GAP_PAGE_SIZE,
    enabled: tab === "links",
    authorized,
    runNonce: run.runNonce,
  });

  const tabQueries: Record<
    CompetitorsTab,
    UseQueryResult<{
      rows: unknown[];
      totalCount: number | null;
      fetchedAt: string;
    }>
  > = {
    competitors: competitorsQuery,
    gap: gapQuery,
    links: linkGapQuery,
  };
  const activeQuery = tabQueries[tab];
  const errorMessage = activeQuery.isError
    ? getStandardErrorMessage(activeQuery.error)
    : null;

  const needsCompetitor = tab === "gap" || tab === "links";
  const pageSize = TAB_PAGE_SIZES[tab];
  const rowsOnPage = activeQuery.data?.rows.length ?? 0;
  const totalCount = activeQuery.data?.totalCount ?? null;

  return (
    <AppPageShell>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Users className="size-6" />
            Competitor Insights
          </h1>
          <p className="text-sm text-base-content/60">
            Discover who you compete with in organic search and find the
            keywords and links they have that you don&apos;t.
          </p>
        </div>
        <DataFreshness
          fetchedAt={activeQuery.data?.fetchedAt}
          onRefresh={() => run.authorize()}
          refreshing={activeQuery.isFetching && !activeQuery.isPending}
        />
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <CompetitorsSearchForm
            targetInput={targetInput}
            competitorInput={competitorInput}
            needsCompetitor={needsCompetitor}
            isFetching={activeQuery.isFetching}
            onTargetChange={setTargetInput}
            onCompetitorChange={setCompetitorInput}
            onSubmit={() => {
              const nextTarget = targetInput.trim();
              if (!nextTarget) return;
              const nextCompetitor = competitorInput.trim();
              const nextPage =
                nextTarget === target && nextCompetitor === competitor
                  ? page
                  : 1;
              // A competitors run just happened for this target -- the next
              // tab opened should inherit it.
              writeHandoff(projectId, {
                kind: "domain",
                value: nextTarget,
                source: "Competitors",
                at: Date.now(),
              });
              run.authorize(
                buildCompetitorsAuthorizationKey(projectId, {
                  ...searchState,
                  target: nextTarget,
                  competitor: nextCompetitor,
                  page: nextPage,
                }),
              );
              updateSearch({
                target: nextTarget,
                competitor: nextCompetitor,
                page: nextPage,
              });
            }}
          />

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

      {!target && tab === "competitors" ? (
        <RecentRunsList
          projectId={projectId}
          feature={RUN_FEATURES.competitors}
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
            setTargetInput(restoredRun.label);
            writeHandoff(projectId, {
              kind: "domain",
              value: restoredRun.label,
              source: "Competitors",
              at: Date.now(),
            });
            run.authorize(
              buildCompetitorsAuthorizationKey(projectId, {
                ...searchState,
                target: restoredRun.label,
                page: 1,
              }),
            );
            updateSearch({ target: restoredRun.label, page: 1 });
          }}
        />
      ) : null}

      {!target && !restoredRun ? (
        <AnalyzeDomainPrompt
          domain={projectDomain}
          title="See who you're up against"
          description="Find the domains competing for this project's keywords, then compare head-to-head."
          preview={COMPETITORS_ANALYZE_PREVIEW}
          onAnalyze={() => {
            if (!projectDomain) return;
            setTargetInput(projectDomain);
            writeHandoff(projectId, {
              kind: "domain",
              value: projectDomain,
              source: "Competitors",
              at: Date.now(),
            });
            run.authorize(
              buildCompetitorsAuthorizationKey(projectId, {
                ...searchState,
                target: projectDomain,
                page: 1,
              }),
            );
            updateSearch({ target: projectDomain, page: 1 });
          }}
          isBusy={competitorsQuery.isFetching}
        />
      ) : null}

      {tab === "competitors" && target ? (
        <CompetitorsOverviewExtras
          projectId={projectId}
          target={target}
          rows={competitorRows}
        />
      ) : null}

      {tab === "gap" && target && competitor ? (
        <KeywordGapOverview
          projectId={projectId}
          target={target}
          competitor={competitor}
          pageSize={DEFAULT_KEYWORD_GAP_PAGE_SIZE}
          activeMode={mode}
          locationCode={market.locationCode}
          languageCode={market.languageCode}
          authorized={authorized}
          runNonce={run.runNonce}
          onModeChange={(nextMode) => updateSearch({ mode: nextMode, page: 1 })}
        />
      ) : null}

      <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
        <div className="border-b border-base-300 px-4 py-3">
          <div role="tablist" className="tabs tabs-border w-fit">
            {COMPETITORS_TABS.map(({ tab: tabId, label }) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={tab === tabId}
                className={`tab ${tab === tabId ? "tab-active" : ""}`}
                onClick={() => updateSearch({ tab: tabId, page: 1 })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <TabBody
          tab={tab}
          target={target}
          competitor={competitor}
          competitorRows={competitorRows}
          gapQuery={gapQuery}
          linkGapQuery={linkGapQuery}
          onCompareCompetitor={(domain) => {
            run.authorize(
              buildCompetitorsAuthorizationKey(projectId, {
                ...searchState,
                competitor: domain,
                tab: "gap",
                mode: "missing",
                page: 1,
              }),
            );
            updateSearch({
              tab: "gap",
              competitor: domain,
              mode: "missing",
              page: 1,
            });
          }}
        />

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
    </AppPageShell>
  );
}
