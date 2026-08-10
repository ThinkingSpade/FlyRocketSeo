import { useMemo } from "react";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { ChevronDown } from "lucide-react";
import { BacklinksOverviewPanels } from "./BacklinksOverviewPanels";
import { LinkVelocityCard } from "./BacklinksProfileSections";
import { BacklinksProfileBreakdowns } from "./BacklinksBreakdownCards";
import { FollowSplitCard } from "./BacklinksProfileInsights";
import { BacklinksCompareSection } from "./BacklinksCompareSection";
import { BacklinksResultsCard } from "./BacklinksPageSections";
import { BacklinksRestoredResultsCard } from "./BacklinksRestoredResultsCard";
import { BacklinksTabInsights } from "./BacklinksTabInsights";
import {
  BacklinksErrorState,
  BacklinksLoadingState,
} from "./BacklinksPageStates";
import { BacklinksHistorySection } from "./BacklinksHistorySection";
import { BacklinksTimelineSection } from "./BacklinksTimelineSection";
import type { BacklinksSearchHistoryItem } from "@/client/hooks/useBacklinksSearchHistory";
import type {
  BacklinksAnchorsData,
  BacklinksOverviewData,
  BacklinksReferringDomainsData,
  BacklinksRowsPageData,
  BacklinksSearchState,
  BacklinksTabRows,
  BacklinksTopPagesData,
} from "./backlinksPageTypes";
import { buildSummaryStats } from "./backlinksPageUtils";
import type { BacklinksDomainExpansion } from "./useBacklinksDomainExpansion";
import type { BacklinksFiltersState } from "./useBacklinksFilters";
import {
  SearchTabStrip,
  type SearchTab,
} from "@/client/features/search-tabs/SearchTabStrip";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import { buildBacklinksVerdict } from "@/client/features/insights/verdicts/backlinks";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Collapsible } from "@cloudflare/kumo/components/collapsible";
import type { BacklinksRestoredResultsPresentation } from "./backlinksRestoredState";
import type { CategoryFilterField } from "./backlinksCategoryFilters";

type BacklinksBodyProps = {
  projectId: string;
  hasTarget: boolean;
  meteredAuthorized: boolean;
  meteredRunNonce: number;
  history: BacklinksSearchHistoryItem[];
  historyLoaded: boolean;
  overviewData: BacklinksOverviewData | undefined;
  overviewError: string | null;
  overviewLoading: boolean;
  backlinksRowsPage: BacklinksRowsPageData | undefined;
  referringDomainsPage: BacklinksReferringDomainsData | undefined;
  topPagesPage: BacklinksTopPagesData | undefined;
  anchorsPage: BacklinksAnchorsData | undefined;
  searchState: BacklinksSearchState;
  filters: BacklinksFiltersState;
  sorting: SortingState;
  domainExpansion: BacklinksDomainExpansion;
  tabErrorMessage: string | null;
  tabLoading: boolean;
  tabFetching: boolean;
  restoredResults: BacklinksRestoredResultsPresentation | null;
  restoredOverviewNotice: string | null;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
  onRemoveHistoryItem: (timestamp: number) => void;
  onRetryOverview: () => void;
  onRefreshRestored: () => void;
  onSelectCategory: (field: CategoryFilterField, rawValue: string) => void;
  onClearCategory: (field: CategoryFilterField) => void;
  onSortingChange: OnChangeFn<SortingState>;
  onTabChange: (tab: BacklinksSearchState["tab"]) => void;
  onViewChange: (view: "all" | undefined) => void;
  searchTabs: {
    activeTabId: string | null;
    tabs: SearchTab[];
    onSelect: (tab: SearchTab) => void;
    onClose: (tabId: string) => void;
    onViewed: (tabId: string, when?: number) => void;
  } | null;
};

export function BacklinksBody({
  projectId,
  hasTarget,
  meteredAuthorized,
  meteredRunNonce,
  history,
  historyLoaded,
  overviewData,
  overviewError,
  overviewLoading,
  backlinksRowsPage,
  referringDomainsPage,
  topPagesPage,
  anchorsPage,
  searchState,
  filters,
  sorting,
  domainExpansion,
  tabErrorMessage,
  tabLoading,
  tabFetching,
  restoredResults,
  restoredOverviewNotice,
  onPageChange,
  onPageSizeChange,
  onRemoveHistoryItem,
  onRetryOverview,
  onRefreshRestored,
  onSelectCategory,
  onClearCategory,
  onSortingChange,
  onTabChange,
  onViewChange,
  searchTabs,
}: BacklinksBodyProps) {
  const tabRows = useMemo<BacklinksTabRows>(
    () => ({
      backlinks: backlinksRowsPage?.rows ?? [],
      referringDomains: referringDomainsPage?.rows ?? [],
      topPages: topPagesPage?.rows ?? [],
      anchors: anchorsPage?.rows ?? [],
    }),
    [backlinksRowsPage, referringDomainsPage, topPagesPage, anchorsPage],
  );
  const activeTabPage =
    searchState.tab === "backlinks"
      ? backlinksRowsPage
      : searchState.tab === "domains"
        ? referringDomainsPage
        : searchState.tab === "anchors"
          ? anchorsPage
          : topPagesPage;
  const summaryStats = useMemo(
    () => buildSummaryStats(overviewData),
    [overviewData],
  );
  const tabStrip = searchTabs ? (
    <SearchTabStrip
      projectId={projectId}
      activeTabId={searchTabs.activeTabId}
      tabs={searchTabs.tabs}
      onSelect={searchTabs.onSelect}
      onClose={searchTabs.onClose}
      onViewed={searchTabs.onViewed}
    />
  ) : null;
  const restoredRowsLoaded = restoredResults?.kind === "loaded";
  const showTimeline = restoredResults == null || restoredRowsLoaded;

  if (!hasTarget && restoredResults == null) {
    return (
      <BacklinksHistorySection
        projectId={projectId}
        history={history}
        historyLoaded={historyLoaded}
        onRemoveHistoryItem={onRemoveHistoryItem}
      />
    );
  }

  if (overviewLoading) {
    return (
      <>
        {tabStrip}
        <BacklinksLoadingState />
      </>
    );
  }

  if (!overviewData) {
    return (
      <>
        {tabStrip}
        <BacklinksErrorState
          errorMessage={overviewError}
          onRetry={onRetryOverview}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {tabStrip}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Overview</h2>
        {restoredOverviewNotice ? (
          <Banner
            variant="secondary"
            title="Showing the saved summary"
            description={restoredOverviewNotice}
          />
        ) : null}
        <BacklinksOverviewPanels
          projectId={projectId}
          data={overviewData}
          summaryStats={summaryStats}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Backlink explorer</h2>
        {restoredResults?.kind === "empty" ? (
          <BacklinksRestoredResultsCard
            presentation={restoredResults}
            onRefresh={onRefreshRestored}
          />
        ) : (
          <BacklinksResultsCard
            projectId={projectId}
            activeTab={searchState.tab}
            tabRows={tabRows}
            filters={filters}
            sorting={sorting}
            view={searchState.view}
            domainExpansion={domainExpansion}
            isTabLoading={tabLoading}
            tabErrorMessage={tabErrorMessage}
            exportTarget={overviewData.displayTarget || searchState.target}
            pagination={{
              page: searchState.page,
              pageSize: searchState.pageSize,
              totalCount: activeTabPage?.totalCount ?? null,
              hasNextPage: activeTabPage?.hasMore ?? false,
              isFetching: tabFetching,
            }}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            onSortingChange={onSortingChange}
            onTabChange={onTabChange}
            onViewChange={onViewChange}
            onClearCategory={onClearCategory}
            tabInsights={
              <BacklinksTabInsights
                activeTab={searchState.tab}
                target={overviewData.displayTarget || searchState.target}
                referringDomains={referringDomainsPage}
                anchors={anchorsPage}
                topPages={topPagesPage}
              />
            }
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Link activity</h2>
        {/* Reads numbers the overview call already returned, so it does not
            spend. */}
        <LinkVelocityCard trends={overviewData.newLostTrends} />
        {/* Timeline authorizes through the page run and fetches on mount. A
            restored refresh therefore waits for the links query to succeed. */}
        {showTimeline ? (
          <BacklinksTimelineSection
            projectId={projectId}
            target={overviewData.displayTarget || searchState.target}
            authorized={meteredAuthorized}
            runNonce={meteredRunNonce}
          />
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Profile composition</h2>
        <BacklinksProfileBreakdowns
          summary={overviewData.summary}
          categoryValues={filters.backlinks.values}
          // Withheld on a restored run: there is no link list to filter yet, so
          // the rows stay informational rather than becoming a second way to
          // trigger a paid refresh.
          onSelectCategory={
            restoredResults?.kind === "empty" ? undefined : onSelectCategory
          }
        />

        {/* Reads the overview summary, so it belongs with composition. The
            cards that read a sub-tab's rows now sit above that tab's table
            instead — see BacklinksTabInsights. */}
        <FollowSplitCard summary={overviewData.summary} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Issues &amp; opportunities</h2>
        {/* Pure read of data already on the page -- renders for a restored run
            too, unlike the metered cards below it. */}
        <NextStepsCard
          verdict={buildBacklinksVerdict({
            target: overviewData.displayTarget || searchState.target,
            backlinks: overviewData.summary.backlinks,
            referringDomains: overviewData.summary.referringDomains,
            brokenBacklinks: overviewData.summary.brokenBacklinks,
            backlinksSpamScore: overviewData.summary.backlinksSpamScore,
          })}
          projectId={projectId}
          tab="Backlinks"
        />
      </section>

      <section className="space-y-3">
        <Collapsible.Root className="space-y-3">
          <h2 className="text-base font-semibold">
            <Collapsible.Trigger className="flex w-full items-center justify-between gap-2 text-left">
              Competitive research
              <ChevronDown className="size-4 shrink-0 text-base-content/60 transition-transform [[data-panel-open]_&]:rotate-180" />
            </Collapsible.Trigger>
          </h2>
          <Collapsible.Panel keepMounted className="space-y-3">
            {/* Compare owns separate authorization for each paid action, so its
                launchers are safe even while only a saved summary is visible. */}
            <BacklinksCompareSection
              projectId={projectId}
              target={overviewData.displayTarget || searchState.target}
            />
          </Collapsible.Panel>
        </Collapsible.Root>
      </section>
    </div>
  );
}
