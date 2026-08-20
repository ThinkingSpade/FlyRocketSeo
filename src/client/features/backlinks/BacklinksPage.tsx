import { useCallback, useMemo, useState } from "react";
import type { SortingState, Updater } from "@tanstack/react-table";
import {
  CalendarBlank,
  LinkSimple,
  Network,
  ShieldWarning,
} from "@phosphor-icons/react";
import {
  AnalyzeDomainPrompt,
  type AnalyzePreviewItem,
} from "@/client/components/AnalyzeDomainPrompt";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { backlinksOverviewCacheSchema } from "@/types/schemas/backlinks-results";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import { useProjectDomain } from "@/client/hooks/useProjectDomain";
import { BacklinksSearchCard } from "./BacklinksSearchCard";
import { BacklinksBody } from "./BacklinksPageContent";
import type { BacklinksPageProps } from "./backlinksPageTypes";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import {
  useBacklinksPageData,
  useBacklinksTargetPrefill,
} from "./useBacklinksPageData";
import { useBacklinksDomainExpansion } from "./useBacklinksDomainExpansion";
import { useBacklinksRowsTransaction } from "./useBacklinksRowsTransaction";
import { toBacklinksFiltersPayload } from "./backlinksFilterTypes";
import { useBacklinksRunAuthorization } from "./useBacklinksRunAuthorization";
import { useBacklinksSearchHistory } from "@/client/hooks/useBacklinksSearchHistory";
import {
  BACKLINKS_DEFAULT_SORT,
  DEFAULT_BACKLINKS_PAGE_SIZE,
} from "@/types/schemas/backlinks";
import { AppPageShell } from "@/client/components/AppPageShell";
import { hasBacklinksTarget } from "./backlinksRestoredState";
import { useBacklinksSearchFlow } from "./useBacklinksSearchFlow";

const BACKLINKS_ANALYZE_PREVIEW: AnalyzePreviewItem[] = [
  {
    icon: LinkSimple,
    title: "Backlinks & domains",
    description: "Total links, referring domains, and authority rank",
  },
  {
    icon: CalendarBlank,
    title: "Won vs lost",
    description: "Referring domains gained and lost month by month",
  },
  {
    icon: Network,
    title: "Top pages & anchors",
    description: "Which pages attract links and the anchor text used",
  },
  {
    icon: ShieldWarning,
    title: "Spam & broken links",
    description: "Toxic-link exposure and links pointing at dead pages",
  },
];

export function BacklinksPage({
  projectId,
  searchState,
  navigate,
}: BacklinksPageProps) {
  const hasTarget = hasBacklinksTarget(searchState.target);
  const handlePageChange = useCallback(
    (nextPage: number) => {
      navigate({
        search: (prev) => ({
          ...prev,
          page: nextPage === 1 ? undefined : nextPage,
        }),
        replace: true,
      });
    },
    [navigate],
  );
  const { filters, run } = useBacklinksRunAuthorization({
    projectId,
    searchState,
  });
  const searchAuthorized = run.authorized;

  // Sort lives in the URL so sort changes and the page reset commit in one
  // navigation (no transient fetch of the old page with the new sort).
  const sorting = useMemo<SortingState>(() => {
    const fallback = BACKLINKS_DEFAULT_SORT[searchState.tab];
    const field = searchState.sort ?? fallback.field;
    const order =
      searchState.order ?? (searchState.sort ? "desc" : fallback.order);
    return [{ id: field, desc: order === "desc" }];
  }, [searchState.order, searchState.sort, searchState.tab]);

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      navigate({
        search: (prev) => ({
          ...prev,
          sort: first?.id,
          order: first ? (first.desc ? "desc" : "asc") : undefined,
          page: undefined,
        }),
        replace: true,
      });
    },
    [navigate, sorting],
  );

  const handlePageSizeChange = useCallback(
    (nextPageSize: number) => {
      navigate({
        search: (prev) => ({
          ...prev,
          size:
            nextPageSize === DEFAULT_BACKLINKS_PAGE_SIZE
              ? undefined
              : nextPageSize,
          page: undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleViewChange = useCallback(
    (nextView: "all" | undefined) => {
      navigate({
        search: (prev) => ({ ...prev, view: nextView, page: undefined }),
        replace: true,
      });
    },
    [navigate],
  );

  // Declared before the data hook because it gates those queries: a drill-down
  // moves several pieces of state, and every half-applied combination in
  // between is a distinct -- and billable -- query key.
  const {
    rowsReleased,
    selectCategory,
    clearCategory,
    origin: categoryOrigin,
    returnToBreakdown,
  } = useBacklinksRowsTransaction({
    searchState,
    hasTarget,
    appliedFilters: filters.backlinks.values,
    applyFilters: filters.backlinks.apply,
    navigate,
  });

  const domainExpansion = useBacklinksDomainExpansion({
    projectId,
    searchState,
    authorized: searchAuthorized,
    filters: toBacklinksFiltersPayload(filters.backlinks.values),
  });

  const {
    activeTabErrorMessage,
    activeTabQuery,
    anchorsQuery,
    overviewErrorMessage,
    overviewQuery,
    referringDomainsQuery,
    rowsQuery,
    searchCardInitialValues,
    topPagesQuery,
  } = useBacklinksPageData({
    projectId,
    searchState,
    hasTarget,
    rowsReleased,
    filters,
    authorized: searchAuthorized,
    runNonce: run.runNonce,
  });

  // With no target in the URL every query above stays disabled, so the tab
  // would otherwise show nothing but a prompt. Restoring the project's last run
  // fills the overview in for free: it reads a stored row plus the R2 object
  // that run already paid for, and can never trigger a metered fetch.
  //
  // Only the overview is restored. The four result sub-tabs are separately
  // metered drill-downs that already gate on being the active tab, so they stay
  // on demand rather than firing four paid calls behind a restore.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.backlinks,
    schema: backlinksOverviewCacheSchema,
    enabled: !hasTarget,
    runId: selectedRunId,
  });

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useBacklinksSearchHistory(projectId);
  const handleResultTabChange = useCallback(
    (tab: BacklinksSearchState["tab"]) => {
      navigate({
        search: (prev) => ({
          ...prev,
          tab: tab === "backlinks" ? undefined : tab,
          page: undefined,
          sort: undefined,
          order: undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );
  const projectDomain = useProjectDomain(projectId);
  const targetPrefill = useBacklinksTargetPrefill(
    projectId,
    searchState.target,
    projectDomain,
  );
  const initialRestoredRun =
    !hasTarget && overviewQuery.data == null ? restored : null;
  const {
    canOpenSearch,
    refreshRestoredLinks,
    restoredRefresh,
    restoredResults,
    runBacklinksSearch,
    searchTabs,
  } = useBacklinksSearchFlow({
    projectId,
    searchState,
    hasTarget,
    navigate,
    run,
    rowsQuery,
    restoredRun: initialRestoredRun,
    addSearch,
  });
  const savedOverview =
    restoredRefresh?.overview ?? initialRestoredRun?.result.overview;
  const useSavedOverview =
    savedOverview != null &&
    (initialRestoredRun != null ||
      restoredRefresh?.phase !== "succeeded" ||
      overviewQuery.data == null);
  const overviewData = useSavedOverview ? savedOverview : overviewQuery.data;
  const displayedRestoredRun = useSavedOverview
    ? (restoredRefresh ?? initialRestoredRun)
    : null;
  const restoredOverviewNotice =
    restoredRefresh?.phase === "succeeded" &&
    overviewQuery.data == null &&
    overviewErrorMessage
      ? "The fresh overview couldn't be loaded. The saved summary is still available, and individual links are loaded."
      : null;
  return (
    <AppPageShell>
      <div>
        <h1 className="text-2xl font-semibold">Backlinks</h1>
        <p className="text-sm text-base-content/70">
          Understand who links to a site, what changed recently, and which pages
          attract links.
        </p>
      </div>

      <BacklinksSearchCard
        compact={overviewData != null}
        errorMessage={restoredOverviewNotice ? null : overviewErrorMessage}
        initialValues={searchCardInitialValues}
        canOpenSearch={canOpenSearch}
        tabLimit={searchTabs.limit}
        onSubmit={runBacklinksSearch}
        prefillTarget={targetPrefill}
      />

      {!hasTarget ? (
        <RecentRunsList
          projectId={projectId}
          feature={RUN_FEATURES.backlinks}
          activeRunId={selectedRunId}
          onSelect={setSelectedRunId}
        />
      ) : null}

      {displayedRestoredRun ? (
        <RestoredRunBanner
          label={displayedRestoredRun.label}
          lastRanAt={displayedRestoredRun.lastRanAt}
          runCount={displayedRestoredRun.runCount}
        />
      ) : null}

      {!hasTarget && !initialRestoredRun ? (
        <AnalyzeDomainPrompt
          domain={projectDomain}
          title="Check your own link profile"
          description="See who links to this project's domain, what changed lately, and which pages earn the links."
          preview={BACKLINKS_ANALYZE_PREVIEW}
          onAnalyze={() => {
            if (!projectDomain) return;
            runBacklinksSearch({ target: projectDomain, scope: "domain" });
          }}
          isBusy={overviewQuery.isLoading}
        />
      ) : null}

      <BacklinksBody
        projectId={projectId}
        hasTarget={hasTarget}
        meteredAuthorized={searchAuthorized}
        meteredRunNonce={run.runNonce}
        history={history}
        historyLoaded={historyLoaded}
        overviewData={overviewData}
        overviewError={overviewErrorMessage}
        overviewLoading={
          searchAuthorized && overviewQuery.isLoading && !useSavedOverview
        }
        backlinksRowsPage={rowsQuery.data}
        referringDomainsPage={referringDomainsQuery.data}
        topPagesPage={topPagesQuery.data}
        anchorsPage={anchorsQuery.data}
        searchState={searchState}
        filters={filters}
        sorting={sorting}
        domainExpansion={domainExpansion}
        tabErrorMessage={activeTabErrorMessage}
        tabLoading={searchAuthorized && activeTabQuery.isLoading}
        tabFetching={activeTabQuery.isFetching}
        restoredResults={restoredResults}
        restoredOverviewNotice={restoredOverviewNotice}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onRemoveHistoryItem={removeHistoryItem}
        onRetryOverview={() => run.authorize()}
        onRefreshRestored={refreshRestoredLinks}
        onSelectCategory={selectCategory}
        onClearCategory={clearCategory}
        categoryOrigin={categoryOrigin}
        onReturnToBreakdown={returnToBreakdown}
        onSortingChange={handleSortingChange}
        onTabChange={handleResultTabChange}
        onViewChange={handleViewChange}
        searchTabs={
          hasTarget || restoredResults != null
            ? {
                activeTabId: searchTabs.activeTabId,
                tabs: searchTabs.tabs,
                onSelect: searchTabs.selectTab,
                onClose: searchTabs.closeTab,
                onViewed: searchTabs.markTabViewed,
              }
            : null
        }
      />
    </AppPageShell>
  );
}
