/* eslint-disable max-lines, max-lines-per-function -- Domain Overview keeps page-only orchestration colocated to avoid fake indirection. */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useForm, useStore } from "@tanstack/react-form";
import {
  ArrowLeft,
  BarChart3,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
  domainOverviewResultSchema,
  type DomainSearchParams,
} from "@/types/schemas/domain";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useAutoRestoredRun } from "@/client/features/analysis-runs/useAutoRestoredRun";
import { RestoredRunBanner } from "@/client/features/analysis-runs/RestoredRunBanner";
import { RecentRunsList } from "@/client/features/analysis-runs/RecentRunsList";
import {
  DEFAULT_LOCATION_CODE,
  LOCATIONS,
  getLanguageCode,
  isLabsLocationCode,
} from "@/client/features/keywords/locations";
import { DataFreshness } from "@/client/components/DataFreshness";
import {
  AnalyzeDomainPrompt,
  type AnalyzePreviewItem,
} from "@/client/components/AnalyzeDomainPrompt";
import {
  useProjectDomain,
  useProjectMarket,
} from "@/client/hooks/useProjectDomain";
import { useDomainSearchHistory } from "@/client/hooks/useDomainSearchHistory";
import type { DomainSearchHistoryItem } from "@/client/hooks/useDomainSearchHistory";
import {
  getDomainSearchChangeValidationErrors,
  getDomainSearchValidationErrors,
} from "@/client/features/domain/domainSearchValidation";
import { useDomainOverviewQuery } from "@/client/features/domain/hooks/useDomainOverviewQuery";
import { DomainOverviewLoadingState } from "@/client/features/domain/components/DomainOverviewLoadingState";
import { DomainHistorySection } from "@/client/features/domain/components/DomainHistorySection";
import { DomainSearchCard } from "@/client/features/domain/components/DomainSearchCard";
import { KeywordsTab } from "@/client/features/domain/components/KeywordsTab";
import { PagesTab } from "@/client/features/domain/components/PagesTab";
import { StatCard } from "@/client/features/domain/components/StatCard";
import { PositionDistribution } from "@/client/features/domain/components/PositionDistribution";
import { DomainCompetitorsCard } from "@/client/features/domain/components/DomainCompetitorsCard";
import { DomainVisibilityTrend } from "@/client/features/domain/components/DomainVisibilityTrend";
import { SearchTabStrip } from "@/client/features/search-tabs/SearchTabStrip";
import type { SearchTabInput } from "@/client/features/search-tabs/types";
import { useSearchTabNavigation } from "@/client/features/search-tabs/useSearchTabNavigation";
import {
  formatMetric,
  getDefaultSortOrder,
  normalizeDomainTarget,
  toSortOrderSearchParam,
  toSortSearchParam,
} from "@/client/features/domain/utils";
import {
  createFormValidationErrors,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import { buildDomainFiltersClearSearchUpdate } from "@/client/features/domain/domainFilterUtils";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { useLastRunInput } from "@/client/features/insights/useLastRunInput";
import { resolvePrefill } from "@/client/features/insights/resolvePrefill";
import {
  useHandoff,
  writeHandoff,
} from "@/client/features/insights/handoffStore";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import { buildDomainVerdict } from "@/client/features/insights/verdicts/domain";
import type { DomainOverviewRouteState } from "@/client/features/domain/domainRouteState";
import type {
  DomainActiveTab,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";
import { AppPageShell } from "@/client/components/AppPageShell";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Button } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";

type Props = {
  projectId: string;
  routeState: DomainOverviewRouteState;
  navigate: (args: {
    search: (prev: Record<string, unknown>) => Record<string, unknown>;
    replace: boolean;
  }) => void;
  onShowRecentSearches: () => void;
};

type DomainNavigate = Props["navigate"];
type DomainSearchUpdate = Partial<DomainSearchParams>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The `extract` this tab hands to `useLastRunInput`: pulls `domain` off the
 * stored domain-overview result. A shape that has drifted (or isn't this
 * feature's result at all) returns null rather than throwing — the tab
 * simply has no last-run value to offer, same contract as the hook itself.
 */
function extractStoredDomain(result: unknown): string | null {
  if (!isRecord(result)) return null;
  return typeof result.domain === "string" ? result.domain : null;
}

const KEYWORDS_ONLY_SORTS: ReadonlySet<DomainSortMode> = new Set([
  "rank",
  "score",
  "cpc",
]);

function getSortSearchUpdate(
  nextSort: DomainSortMode,
  nextOrder: SortOrder,
): DomainSearchUpdate {
  return {
    sort: toSortSearchParam(nextSort),
    order: toSortOrderSearchParam(nextSort, nextOrder),
    page: undefined,
  };
}

function getLocationSearchUpdate(nextLocationCode: number): DomainSearchUpdate {
  return {
    loc:
      nextLocationCode === DEFAULT_LOCATION_CODE ? undefined : nextLocationCode,
    page: undefined,
  };
}

function getPageSearchUpdate(nextPage: number): DomainSearchUpdate {
  const safe = Math.max(1, Math.floor(nextPage));
  return { page: safe === 1 ? undefined : safe };
}

function getPageSizeSearchUpdate(nextSize: number): DomainSearchUpdate {
  return {
    size: nextSize === DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE ? undefined : nextSize,
    page: undefined,
  };
}

function getTabSearchUpdate(
  nextTab: DomainActiveTab,
  currentSort: DomainSortMode,
): DomainSearchUpdate {
  if (nextTab === "keywords") {
    return { tab: undefined, page: undefined };
  }

  const fallbackSortNeeded = KEYWORDS_ONLY_SORTS.has(currentSort);
  const update: DomainSearchUpdate = {
    tab: "pages",
    page: undefined,
  };
  if (fallbackSortNeeded) {
    update.sort = "traffic";
    update.order = getDefaultSortOrder("traffic");
  }
  return update;
}

function getHistorySearchUpdate(
  item: DomainSearchHistoryItem,
): DomainSearchUpdate {
  const historyLocation =
    item.locationCode != null && isLabsLocationCode(item.locationCode)
      ? item.locationCode
      : DEFAULT_LOCATION_CODE;

  return {
    ...buildDomainFiltersClearSearchUpdate(),
    domain: item.domain,
    subdomains: item.subdomains ? undefined : false,
    sort: toSortSearchParam(item.sort),
    order: undefined,
    tab: item.tab === "keywords" ? undefined : item.tab,
    loc:
      historyLocation === DEFAULT_LOCATION_CODE ? undefined : historyLocation,
    size: undefined,
  };
}

function getSearchSubmitUpdate({
  domain,
  subdomains,
  sort,
  locationCode,
  currentOrder,
  activeTab,
}: {
  domain: string;
  subdomains: boolean;
  sort: DomainSortMode;
  locationCode: number;
  currentOrder: SortOrder;
  activeTab: DomainActiveTab;
}): DomainSearchUpdate {
  return {
    ...buildDomainFiltersClearSearchUpdate(),
    domain,
    subdomains: subdomains ? undefined : false,
    sort: toSortSearchParam(sort),
    order: toSortOrderSearchParam(sort, currentOrder),
    tab: activeTab === "keywords" ? undefined : activeTab,
    loc: locationCode === DEFAULT_LOCATION_CODE ? undefined : locationCode,
    size: undefined,
  };
}

function useDomainOverviewState({
  navigate,
  routeState,
  projectId,
}: {
  navigate: DomainNavigate;
  routeState: DomainOverviewRouteState;
  projectId: string;
}) {
  const lastTrackedKey = useRef<string>("");

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useDomainSearchHistory(projectId);

  const market = useProjectMarket(projectId);
  const projectDomain = useProjectDomain(projectId);
  const handoff = useHandoff(projectId);
  // This page already imports RUN_FEATURES for its RecentRunsList; reuse the
  // same feature key so both read one cache entry.
  const lastRun = useLastRunInput(
    projectId,
    RUN_FEATURES.domainOverview,
    extractStoredDomain,
  );
  // The URL param wins, then a domain carried from another tab, then what
  // this tab last ran, then the project's own domain (the same fallback
  // `AnalyzeDomainPrompt` already offers as an explicit click below).
  // Resolved only for the field's initial value — after that the user owns
  // the input. There's no domain-shaped suggestion source, so this kind
  // always passes an empty suggestions list.
  const domainPrefill = resolvePrefill({
    kind: "domain",
    searchParam: routeState.domain,
    handoff,
    lastRun,
    suggestions: [],
    projectDefault: projectDomain,
  });

  const setSearchParams = useCallback(
    (updates: DomainSearchUpdate) => {
      navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  const applySort = useCallback(
    (nextSort: DomainSortMode, nextOrder: SortOrder) => {
      setSearchParams(getSortSearchUpdate(nextSort, nextOrder));
    },
    [setSearchParams],
  );

  const [locationTouched, setLocationTouched] = useState(false);
  const applyLocationChange = useCallback(
    (nextLocationCode: number) => {
      setLocationTouched(true);
      setSearchParams(getLocationSearchUpdate(nextLocationCode));
    },
    [setSearchParams],
  );

  const handleSortColumnClick = useCallback(
    (nextSort: DomainSortMode) => {
      const nextOrder =
        nextSort === routeState.sort
          ? routeState.order === "asc"
            ? "desc"
            : "asc"
          : getDefaultSortOrder(nextSort);
      applySort(nextSort, nextOrder);
    },
    [applySort, routeState.order, routeState.sort],
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      setSearchParams(getPageSearchUpdate(nextPage));
    },
    [setSearchParams],
  );

  const setPageSize = useCallback(
    (nextSize: number) => {
      setSearchParams(getPageSizeSearchUpdate(nextSize));
    },
    [setSearchParams],
  );

  const handleTabChange = useCallback(
    (nextTab: DomainActiveTab) => {
      setSearchParams(getTabSearchUpdate(nextTab, routeState.sort));
    },
    [routeState.sort, setSearchParams],
  );

  const handleHistorySelect = useCallback(
    (item: DomainSearchHistoryItem) => {
      setSearchParams(getHistorySearchUpdate(item));
    },
    [setSearchParams],
  );

  const languageCode = getLanguageCode(routeState.locationCode);
  const [runInput, setRunInput] = useState<{
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
  } | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  const overviewQuery = useDomainOverviewQuery({
    projectId,
    domain: runInput?.domain ?? "",
    includeSubdomains: runInput?.includeSubdomains ?? routeState.subdomains,
    locationCode: runInput?.locationCode ?? routeState.locationCode,
    languageCode: runInput?.languageCode ?? languageCode,
    authorized: runInput != null,
    runNonce,
  });
  // With no domain in the URL the live query above stays disabled, so the tab
  // would otherwise show a blank prompt. Restoring the project's last run fills
  // it in for free: it reads a stored row plus the R2 object that run already
  // paid for, and can never trigger a metered fetch.
  // Which past run the user is looking at; null means "the most recent".
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { restored, expired: restoreExpired } = useAutoRestoredRun({
    projectId,
    feature: RUN_FEATURES.domainOverview,
    schema: domainOverviewResultSchema,
    enabled: runInput == null,
    runId: selectedRunId,
  });

  const overview = overviewQuery.data ?? restored?.result ?? null;
  const restoredRun = overviewQuery.data == null ? restored : null;
  const isLoading = runInput != null && overviewQuery.isLoading;

  const controlsForm = useForm({
    defaultValues: {
      domain: routeState.domain,
      subdomains: routeState.subdomains,
      sort: routeState.sort,
      locationCode: routeState.locationCode,
    },
    validators: {
      onChange: ({ formApi, value }) =>
        getDomainSearchChangeValidationErrors(
          value,
          shouldValidateFieldOnChange(formApi, "domain"),
          formApi.state.submissionAttempts > 0,
        ),
      onSubmit: ({ value }) => getDomainSearchValidationErrors(value),
    },
    onSubmit: ({ formApi, value }) => {
      const target = normalizeDomainTarget(value.domain);
      if (!target) return;
      formApi.setFieldValue("domain", target);
      setRunInput({
        domain: target,
        includeSubdomains: value.subdomains,
        locationCode: value.locationCode,
        languageCode: getLanguageCode(value.locationCode),
      });
      setRunNonce((previous) => previous + 1);
      // Covers a fresh search, the "Analyze <domain>" prompt, and "Run again"
      // alike -- all three funnel through this one `onSubmit` (they each just
      // set the form's `domain` field first), and all three are equally "a
      // domain overview run just happened for this target", which is exactly
      // what the next tab opened should inherit.
      writeHandoff(projectId, {
        kind: "domain",
        value: target,
        locationCode: value.locationCode,
        source: "Domain Overview",
        at: Date.now(),
      });
      setSearchParams(
        getSearchSubmitUpdate({
          domain: target,
          subdomains: value.subdomains,
          sort: value.sort,
          locationCode: value.locationCode,
          currentOrder: routeState.order,
          activeTab: routeState.tab,
        }),
      );
    },
  });

  useEffect(() => {
    controlsForm.reset({
      domain: routeState.domain,
      subdomains: routeState.subdomains,
      sort: routeState.sort,
      locationCode: routeState.locationCode,
    });
  }, [
    controlsForm,
    routeState.domain,
    routeState.locationCode,
    routeState.sort,
    routeState.subdomains,
  ]);

  const currentDomain = useStore(controlsForm.store, (s) => s.values.domain);
  const domainIsDirty = useStore(
    controlsForm.store,
    (s) => s.fieldMeta.domain?.isDirty ?? false,
  );
  // Every prefill source above resolves after first paint, so the form's
  // `defaultValues` can never see it. Seed the field once a value lands, but
  // never fight the user: bail as soon as they've typed (domainIsDirty), and
  // even before that, bail if the field is non-empty (a `domain` URL param, a
  // history pick, or a prior submit already won). `dontUpdateMeta` keeps this
  // programmatic fill from masquerading as the user's own edit. Typing into
  // the domain box never navigates mid-keystroke (only submit does, via
  // `getSearchSubmitUpdate`), so unlike the location field below, `isDirty`
  // here is never wiped out from under this effect by the route-state reset
  // effect above.
  useEffect(() => {
    if (domainIsDirty) return;
    if (currentDomain.trim() !== "") return;
    if (domainPrefill.value === "") return;
    controlsForm.setFieldValue("domain", domainPrefill.value, {
      dontUpdateMeta: true,
    });
  }, [domainIsDirty, currentDomain, domainPrefill.value, controlsForm]);

  // `routeState.locationCode` always resolves to a concrete Labs location
  // code (DEFAULT_LOCATION_CODE when `loc` is missing or invalid), so unlike
  // the domain field there's no "empty" state to test -- `hasExplicitLocationCode`
  // (a real `loc` appeared in the URL) plays that role instead. `locationTouched`
  // -- not the form's own `isDirty` meta -- is the "user already chose one"
  // signal: the reset effect above re-`reset()`s this whole form (which wipes
  // every field's dirty/touched meta back to pristine) every time
  // `routeState.locationCode` changes, and picking a location changes it
  // immediately (`onLocationChange`/`applyLocationChange` commits straight to
  // the URL). A meta flag would flicker back to false the instant that
  // round-trip lands, letting this effect immediately re-fire and stomp a
  // location the user just picked -- most visibly when they deliberately pick
  // the one value that matches `DEFAULT_LOCATION_CODE`, which the URL layer
  // omits as "nothing explicit" (see `getLocationSearchUpdate`). A plain flag
  // set once in `applyLocationChange` survives that round-trip for the rest of
  // the mount. Depending on the primitive `market.locationCode` (not the
  // `market` object) keeps this from re-running every render: an unstable
  // object dependency has caused a real render loop in this codebase before.
  useEffect(() => {
    if (routeState.hasExplicitLocationCode) return;
    if (locationTouched) return;
    controlsForm.setFieldValue("locationCode", market.locationCode, {
      dontUpdateMeta: true,
    });
  }, [
    routeState.hasExplicitLocationCode,
    locationTouched,
    market.locationCode,
    controlsForm,
  ]);

  useEffect(() => {
    controlsForm.setErrorMap({
      onSubmit: overviewQuery.error
        ? createFormValidationErrors({
            form: getStandardErrorMessage(
              overviewQuery.error,
              "Lookup failed.",
            ),
          })
        : undefined,
    });
  }, [controlsForm, overviewQuery.error]);

  useEffect(() => {
    if (!overviewQuery.isSuccess || !overview) return;
    const key = `${routeState.domain}|${routeState.subdomains}|${routeState.locationCode}`;
    if (lastTrackedKey.current === key) return;
    lastTrackedKey.current = key;

    captureClientEvent("domain_overview:search_complete", {
      sort_mode: routeState.sort,
      include_subdomains: routeState.subdomains,
      result_count: overview.organicKeywords ?? 0,
      location_code: routeState.locationCode,
    });
    addSearch({
      domain: routeState.domain,
      subdomains: routeState.subdomains,
      sort: routeState.sort,
      tab: routeState.tab,
      locationCode: routeState.locationCode,
    });
    if (!overview.hasData) {
      toast.info("Not enough data for this domain");
    }
  }, [
    addSearch,
    overview,
    overviewQuery.isSuccess,
    routeState.domain,
    routeState.locationCode,
    routeState.sort,
    routeState.subdomains,
    routeState.tab,
  ]);

  useEffect(() => {
    if (routeState.domain.trim() !== "") return;
    lastTrackedKey.current = "";
  }, [routeState.domain]);

  const controlsLocationCode = useStore(
    controlsForm.store,
    (s) => s.values.locationCode,
  );
  const canSaveKeywords = useMemo(
    () =>
      controlsLocationCode === routeState.locationCode &&
      overview !== null &&
      overview.hasData,
    [controlsLocationCode, overview, routeState.locationCode],
  );

  const handleSearchSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void controlsForm.handleSubmit();
    },
    [controlsForm],
  );

  return {
    controlsForm,
    isLoading,
    overview,
    /** Set when `overview` came from a stored past run rather than a live one. */
    restoredRun,
    /** Set when a past run EXISTS but its stored result has aged out. */
    restoreExpired,
    selectedRunId,
    setSelectedRunId,
    refetchOverview: overviewQuery.refetch,
    overviewRefreshing: overviewQuery.isFetching && !overviewQuery.isPending,
    canSaveKeywords,
    history,
    historyLoaded,
    removeHistoryItem,
    languageCode,
    setSearchParams,
    applySort,
    applyLocationChange,
    handleTabChange,
    handleSortColumnClick,
    handleHistorySelect,
    handleSearchSubmit,
    goToPage,
    setPageSize,
  };
}

export type DomainOverviewControlsForm = ReturnType<
  typeof useDomainOverviewState
>["controlsForm"];

const DOMAIN_ANALYZE_PREVIEW: AnalyzePreviewItem[] = [
  {
    icon: TrendingUp,
    title: "Traffic & keywords",
    description: "Estimated organic traffic and how many keywords rank",
  },
  {
    icon: BarChart3,
    title: "Ranking distribution",
    description: "How positions split across #1–3, #4–10, #11–20 and beyond",
  },
  {
    icon: Users,
    title: "Top competitors",
    description: "The domains sharing the most keywords with this one",
  },
  {
    icon: FileText,
    title: "Keywords & pages",
    description: "Full ranked-keyword and top-page tables with a traffic map",
  },
];

export function DomainOverviewPage({
  projectId,
  routeState,
  navigate,
  onShowRecentSearches,
}: Props) {
  const state = useDomainOverviewState({ navigate, routeState, projectId });
  const projectDomain = useProjectDomain(projectId);
  const urlTabInput = useMemo<SearchTabInput | null>(() => {
    if (routeState.domain.trim() === "") return null;
    return {
      type: "domain",
      domain: routeState.domain,
      subdomains: routeState.subdomains,
      locationCode: routeState.locationCode,
    };
  }, [routeState.domain, routeState.locationCode, routeState.subdomains]);

  const navigateToSearchTab = useCallback(
    (input: SearchTabInput | null) => {
      if (input?.type !== "domain") {
        navigate({
          search: () => ({}),
          replace: true,
        });
        return;
      }

      navigate({
        search: (prev) => ({
          ...prev,
          ...buildDomainFiltersClearSearchUpdate(),
          domain: input.domain,
          subdomains: input.subdomains ? undefined : false,
          sort: undefined,
          order: undefined,
          tab: undefined,
          page: undefined,
          loc:
            input.locationCode === DEFAULT_LOCATION_CODE
              ? undefined
              : input.locationCode,
          size: undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const searchTabs = useSearchTabNavigation({
    storageKey: `domain:${projectId}`,
    urlInput: urlTabInput,
    getLabel: useCallback((input) => {
      if (input.type !== "domain") return "";
      const locationSuffix =
        input.locationCode === DEFAULT_LOCATION_CODE
          ? ""
          : ` ${LOCATIONS[input.locationCode] ?? input.locationCode}`;
      return `${input.domain}${locationSuffix}`;
    }, []),
    navigateToInput: navigateToSearchTab,
  });

  const handleSearchSubmit = useCallback(
    (event: FormEvent) => {
      const values = state.controlsForm.state.values;
      const target = normalizeDomainTarget(values.domain);
      if (!target) {
        state.handleSearchSubmit(event);
        return;
      }

      const nextTabInput: SearchTabInput = {
        type: "domain",
        domain: target,
        subdomains: values.subdomains,
        locationCode: values.locationCode,
      };

      if (!searchTabs.canOpenTab(nextTabInput)) {
        event.preventDefault();
        state.controlsForm.setErrorMap({
          onSubmit: createFormValidationErrors({
            fields: {
              domain: `Close a tab to open more searches (max ${searchTabs.limit}).`,
            },
          }),
        });
        return;
      }

      state.handleSearchSubmit(event);
    },
    [searchTabs, state],
  );

  const tabControls = routeState.domain ? (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-0 text-base-content/70 hover:bg-transparent"
          onClick={() => {
            searchTabs.setActiveTab(null);
            onShowRecentSearches();
          }}
        >
          <ArrowLeft className="size-4" />
          Recent searches
        </Button>
      </div>
      <SearchTabStrip
        projectId={projectId}
        activeTabId={searchTabs.activeTabId}
        tabs={searchTabs.tabs}
        onSelect={searchTabs.selectTab}
        onClose={searchTabs.closeTab}
        onViewed={searchTabs.markTabViewed}
      />
    </div>
  ) : null;

  return (
    <AppPageShell>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Domain Overview</h1>
          <p className="text-sm text-base-content/70">
            Analyze any domain&apos;s SEO profile: traffic, keywords, and
            backlinks.
          </p>
        </div>
        <DataFreshness
          fetchedAt={state.overview?.fetchedAt}
          onRefresh={() => void state.refetchOverview()}
          refreshing={state.overviewRefreshing}
        />
      </div>

      <DomainSearchCard
        controlsForm={state.controlsForm}
        isLoading={state.isLoading}
        onSubmit={handleSearchSubmit}
        onSortChange={(sort) =>
          state.applySort(sort, getDefaultSortOrder(sort))
        }
        onLocationChange={(locationCode) =>
          state.applyLocationChange(locationCode)
        }
      />

      {state.isLoading ? (
        <>
          {tabControls}
          <DomainOverviewLoadingState />
        </>
      ) : state.overview === null ? (
        <div className="space-y-4 pt-1">
          <AnalyzeDomainPrompt
            domain={projectDomain}
            title="Start with your own site"
            description="Run a full organic profile for this project's domain — or search any competitor above."
            preview={DOMAIN_ANALYZE_PREVIEW}
            onAnalyze={() => {
              if (!projectDomain) return;
              state.controlsForm.setFieldValue("domain", projectDomain);
              void state.controlsForm.handleSubmit();
            }}
            isBusy={state.isLoading}
          />
          {/* A run whose stored result is gone is NOT the same as never having
              used this tab, but both used to render exactly this prompt. Say
              which it was, so the blank screen stops looking like a bug. */}
          {state.restoreExpired ? (
            <div className="rounded-lg border border-base-300 bg-base-200/40 px-4 py-3 text-sm text-base-content/70">
              Your last run ({state.restoreExpired.label}) is too old to re-open
              — stored results are kept for 90 days. Running it again will
              refresh it.
            </div>
          ) : null}
          <DomainHistorySection
            history={state.history}
            historyLoaded={state.historyLoaded}
            onRemoveHistoryItem={state.removeHistoryItem}
            onSelectHistoryItem={state.handleHistorySelect}
          />
        </div>
      ) : (
        <>
          {state.restoredRun ? (
            <RecentRunsList
              projectId={projectId}
              feature={RUN_FEATURES.domainOverview}
              activeRunId={state.selectedRunId}
              onSelect={state.setSelectedRunId}
            />
          ) : null}
          {state.restoredRun ? (
            <RestoredRunBanner
              label={state.restoredRun.label}
              lastRanAt={state.restoredRun.lastRanAt}
              runCount={state.restoredRun.runCount}
              onRunAgain={() => {
                state.controlsForm.setFieldValue(
                  "domain",
                  state.restoredRun?.label ?? "",
                );
                void state.controlsForm.handleSubmit();
              }}
            />
          ) : null}
          {tabControls}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <StatCard
              label="Estimated Organic Traffic"
              value={formatMetric(
                state.overview.organicTraffic,
                state.overview.hasData,
              )}
            />
            <StatCard
              label="Organic Keywords"
              value={formatMetric(
                state.overview.organicKeywords,
                state.overview.hasData,
              )}
            />
          </div>

          {state.overview.hasData && state.overview.positionBuckets ? (
            <PositionDistribution buckets={state.overview.positionBuckets} />
          ) : null}

          {/* Pure read of data already on the page -- renders even when
                hasData is false (an honest "unknown" tone), unlike the
                metered cards below it. */}
          <NextStepsCard
            verdict={buildDomainVerdict({
              domain: state.overview.domain,
              organicKeywords: state.overview.organicKeywords,
              organicTraffic: state.overview.organicTraffic,
              positionBuckets: state.overview.positionBuckets,
            })}
            projectId={projectId}
            tab="Domain Overview"
          />

          {state.overview.hasData ? (
            <DomainCompetitorsCard
              projectId={projectId}
              domain={state.overview.domain}
            />
          ) : null}

          {state.overview.hasData ? (
            <DomainVisibilityTrend
              projectId={projectId}
              domain={state.overview.domain}
              locationCode={routeState.locationCode}
              languageCode={getLanguageCode(routeState.locationCode)}
            />
          ) : null}

          {!state.overview.hasData ? (
            <Banner variant="default">
              <span>
                Not enough data for this domain yet. Try another domain or
                include subdomains.
              </span>
            </Banner>
          ) : null}

          <div className="border border-base-300 rounded-xl bg-base-100 overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-base-300">
              <Tabs
                variant="underline"
                value={routeState.tab}
                onValueChange={(next) => {
                  if (next === "keywords" || next === "pages") {
                    state.handleTabChange(next);
                  }
                }}
                tabs={[
                  { value: "keywords", label: "Top Keywords" },
                  { value: "pages", label: "Top Pages" },
                ]}
              />
            </div>

            {routeState.tab === "keywords" ? (
              <KeywordsTab
                key="keywords"
                projectId={projectId}
                domain={state.overview.domain}
                languageCode={state.languageCode}
                routeState={routeState}
                canSaveKeywords={state.canSaveKeywords}
                setSearchParams={state.setSearchParams}
                onSortClick={state.handleSortColumnClick}
                onPageChange={state.goToPage}
                onPageSizeChange={state.setPageSize}
              />
            ) : (
              <PagesTab
                key="pages"
                projectId={projectId}
                domain={state.overview.domain}
                languageCode={state.languageCode}
                routeState={routeState}
                setSearchParams={state.setSearchParams}
                onSortClick={state.handleSortColumnClick}
                onPageChange={state.goToPage}
                onPageSizeChange={state.setPageSize}
              />
            )}
          </div>
        </>
      )}
    </AppPageShell>
  );
}
