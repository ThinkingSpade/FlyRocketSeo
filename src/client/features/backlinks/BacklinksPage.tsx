import { useCallback, useMemo, useState } from "react";
import type { SortingState, Updater } from "@tanstack/react-table";
import { CalendarRange, Link2, Network, ShieldAlert } from "lucide-react";
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
import { writeHandoff } from "@/client/features/insights/handoffStore";
import { BacklinksSearchCard } from "./BacklinksSearchCard";
import { BacklinksBody } from "./BacklinksPageContent";
import type { BacklinksPageProps } from "./backlinksPageTypes";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import {
  buildBacklinksAuthorizationKey,
  navigateToBacklinksSearch,
  useBacklinksPageData,
  useBacklinksTargetPrefill,
} from "./useBacklinksPageData";
import { useBacklinksDomainExpansion } from "./useBacklinksDomainExpansion";
import { useBacklinksFilters } from "./useBacklinksFilters";
import { useBacklinksSearchHistory } from "@/client/hooks/useBacklinksSearchHistory";
import type {
  BacklinksSearchTabInput,
  SearchTabInput,
} from "@/client/features/search-tabs/types";
import { useSearchTabNavigation } from "@/client/features/search-tabs/useSearchTabNavigation";
import {
  BACKLINKS_DEFAULT_SORT,
  DEFAULT_BACKLINKS_PAGE_SIZE,
} from "@/types/schemas/backlinks";
import { useAuthorizedRun } from "@/client/lib/useMeteredQuery";

const BACKLINKS_ANALYZE_PREVIEW: AnalyzePreviewItem[] = [
  {
    icon: Link2,
    title: "Backlinks & domains",
    description: "Total links, referring domains, and authority rank",
  },
  {
    icon: CalendarRange,
    title: "Won vs lost",
    description: "Referring domains gained and lost month by month",
  },
  {
    icon: Network,
    title: "Top pages & anchors",
    description: "Which pages attract links and the anchor text used",
  },
  {
    icon: ShieldAlert,
    title: "Spam & broken links",
    description: "Toxic-link exposure and links pointing at dead pages",
  },
];

export function BacklinksPage({
  projectId,
  searchState,
  navigate,
}: BacklinksPageProps) {
  const filters = useBacklinksFilters(projectId);
  const currentSearchKey = buildBacklinksAuthorizationKey(
    projectId,
    searchState,
    filters,
  );
  const run = useAuthorizedRun(currentSearchKey);
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

  const domainExpansion = useBacklinksDomainExpansion({
    projectId,
    searchState,
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
    enabled: searchState.target.trim() === "",
    runId: selectedRunId,
  });

  const overviewData = overviewQuery.data ?? restored?.result.overview;
  const restoredRun = overviewQuery.data == null ? restored : null;

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useBacklinksSearchHistory(projectId);
  const urlTabInput = useMemo<SearchTabInput | null>(() => {
    if (searchState.target.trim() === "") return null;
    return {
      type: "backlinks",
      target: searchState.target,
      scope: searchState.scope,
    };
  }, [searchState.scope, searchState.target]);
  const navigateToTab = useCallback(
    (input: SearchTabInput | null) => {
      if (input?.type !== "backlinks") {
        navigate({
          search: () => ({}),
          replace: true,
        });
        return;
      }
      navigateToBacklinksSearch(navigate, {
        target: input.target,
        scope: input.scope,
      });
    },
    [navigate],
  );
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
  const searchTabs = useSearchTabNavigation({
    storageKey: `backlinks:${projectId}`,
    urlInput: urlTabInput,
    getLabel: useCallback(
      (input) => (input.type === "backlinks" ? input.target : ""),
      [],
    ),
    navigateToInput: navigateToTab,
  });
  const toBacklinksTabInput = useCallback(
    (
      values: Pick<BacklinksSearchState, "target" | "scope">,
    ): BacklinksSearchTabInput => ({
      type: "backlinks",
      target: values.target,
      scope: values.scope,
    }),
    [],
  );
  const projectDomain = useProjectDomain(projectId);
  const targetPrefill = useBacklinksTargetPrefill(
    projectId,
    searchState.target,
    projectDomain,
  );
  // Shared by the search form, "Run again", and the "analyze my domain"
  // prompt so all three open a tab, navigate, and record history identically.
  const runBacklinksSearch = useCallback(
    (values: Pick<BacklinksSearchState, "target" | "scope">) => {
      // Every trigger below is "a backlinks run just happened for this
      // target" -- a fresh search, a repeat via "Run again", or the analyze
      // prompt -- which is exactly what the next tab opened should inherit.
      writeHandoff(projectId, {
        kind: "domain",
        value: values.target,
        source: "Backlinks",
        at: Date.now(),
      });
      if (
        values.target === searchState.target &&
        values.scope === searchState.scope
      ) {
        run.authorize();
        return;
      }
      const nextSearchState: BacklinksSearchState = {
        ...searchState,
        target: values.target,
        scope: values.scope,
        tab: "backlinks",
        page: 1,
        sort: undefined,
        order: undefined,
      };
      run.authorize(
        buildBacklinksAuthorizationKey(projectId, nextSearchState, filters),
      );
      searchTabs.openTab(toBacklinksTabInput(values));
      navigateToBacklinksSearch(navigate, values);
      addSearch({ target: values.target, scope: values.scope });
    },
    [
      addSearch,
      filters,
      navigate,
      projectId,
      run,
      searchState,
      searchTabs,
      toBacklinksTabInput,
    ],
  );
  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Backlinks</h1>
          <p className="text-sm text-base-content/70">
            Understand who links to a site, what changed recently, and which
            pages attract links.
          </p>
        </div>

        <BacklinksSearchCard
          errorMessage={overviewErrorMessage}
          initialValues={searchCardInitialValues}
          canOpenSearch={(values) =>
            searchTabs.canOpenTab(toBacklinksTabInput(values))
          }
          tabLimit={searchTabs.limit}
          onSubmit={runBacklinksSearch}
          prefillTarget={targetPrefill}
        />

        {searchState.target.trim() === "" ? (
          <RecentRunsList
            projectId={projectId}
            feature={RUN_FEATURES.backlinks}
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
              runBacklinksSearch({
                // From the restored result rather than its label, so "run
                // again" repeats the same scope it was originally run at.
                target: restoredRun.result.overview.target,
                scope: restoredRun.result.overview.scope,
              });
            }}
          />
        ) : null}

        {searchState.target.trim() === "" && !restoredRun ? (
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
          meteredAuthorized={searchAuthorized}
          meteredRunNonce={run.runNonce}
          history={history}
          historyLoaded={historyLoaded}
          overviewData={overviewData}
          overviewError={overviewErrorMessage}
          overviewLoading={searchAuthorized && overviewQuery.isLoading}
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
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onRemoveHistoryItem={removeHistoryItem}
          onRetryOverview={() => run.authorize()}
          onSortingChange={handleSortingChange}
          onTabChange={handleResultTabChange}
          onViewChange={handleViewChange}
          searchTabs={
            searchState.target
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
      </div>
    </div>
  );
}
