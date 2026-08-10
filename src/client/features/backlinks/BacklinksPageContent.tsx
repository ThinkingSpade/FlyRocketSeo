import { useMemo } from "react";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { BacklinksOverviewPanels } from "./BacklinksOverviewPanels";
import {
  BacklinksProfileBreakdowns,
  BrokenLinkReclaimCard,
  LinkVelocityCard,
} from "./BacklinksProfileSections";
import {
  AnchorHealthCard,
  DomainQualityCard,
  FollowSplitCard,
  ToxicLinksCard,
} from "./BacklinksProfileInsights";
import { BacklinksCompareSection } from "./BacklinksCompareSection";
import { BacklinksResultsCard } from "./BacklinksPageSections";
import { BacklinksRestoredResultsCard } from "./BacklinksRestoredResultsCard";
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
import type { BacklinksRestoredResultsPresentation } from "./backlinksRestoredState";

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
    <>
      {tabStrip}
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

      {/* All three read numbers the overview and Top Pages calls already
          returned, so none of them spends. */}
      <LinkVelocityCard trends={overviewData.newLostTrends} />
      <BacklinksProfileBreakdowns summary={overviewData.summary} />

      {/* Derived views over data already fetched: the follow split reads the
          overview summary, the other two read whichever results sub-tab the
          user has opened. None of them fetch, so they are safe on a restored
          run — they simply render nothing until their rows exist. */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <FollowSplitCard summary={overviewData.summary} />
        <DomainQualityCard referringDomains={referringDomainsPage} />
        <AnchorHealthCard
          anchors={anchorsPage}
          target={overviewData.displayTarget || searchState.target}
        />
      </div>
      <ToxicLinksCard
        referringDomains={referringDomainsPage}
        target={overviewData.displayTarget || searchState.target}
      />
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
        />
      )}
      {restoredResults == null ? (
        <BrokenLinkReclaimCard topPages={topPagesPage} />
      ) : null}
      {/* Compare owns separate authorization for each paid action, so its
          launchers are safe even while only a saved summary is visible. */}
      <BacklinksCompareSection
        projectId={projectId}
        target={overviewData.displayTarget || searchState.target}
      />
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
    </>
  );
}
