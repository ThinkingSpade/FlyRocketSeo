import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { extractKeywordGroups } from "@/client/features/keywords/keywordGroups";
import {
  useKeywordControlsForm,
  type KeywordControlsValues,
} from "@/client/features/keywords/hooks/useKeywordControlsForm";
import { useKeywordFiltering } from "@/client/features/keywords/hooks/useKeywordFiltering";
import {
  mergeFitVerdicts,
  useKeywordFit,
  useProjectProfile,
  useRefineKeywordFit,
} from "@/client/features/profiles/useProjectProfile";
import { useLocalKeywordFilters } from "@/client/features/keywords/hooks/useLocalKeywordFilters";
import { useKeywordResearchData } from "@/client/features/keywords/hooks/useKeywordResearchData";
import { useKeywordSelection } from "@/client/features/keywords/hooks/useKeywordSelection";
import { useKeywordSerpAnalysis } from "@/client/features/keywords/hooks/useKeywordSerpAnalysis";
import { captureClientEvent } from "@/client/lib/posthog";
import { useSearchHistory } from "@/client/hooks/useSearchHistory";
import {
  type KeywordMode,
  type ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import type { KeywordResearchRow } from "@/types/keywords";
import type { SortDir, SortField } from "@/client/features/keywords/components";
import {
  buildKeywordSearchKey,
  getNextSortParams,
  useSaveAndExportActions,
} from "./keywordControllerActions";
import {
  useKeywordSaveMutation,
  useKeywordSearchParams,
  useKeywordUiState,
  useResolvedKeywordLocation,
} from "./keywordControllerInternals";
import { useKeywordOverviewState } from "./useKeywordOverviewState";
import {
  parseRestoredKeywordResearchGeo,
  useKeywordSessionRuns,
} from "./useKeywordSessionRuns";
import type { TargetArea } from "@/shared/geo/types";

/** Stable empty array for the un-run AI fit pass -- see its use below. */
const NO_AI_VERDICTS: ReadonlyArray<{
  keyword: string;
  verdict: "on-offer" | "adjacent" | "wrong-customer";
  reason: string;
}> = [];

type OpenKeywordTabInput = {
  keyword: string;
  locationCode: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

export type KeywordResearchControllerInput = {
  projectId: string;
  keywordInput: string;
  locationCode: number;
  hasExplicitLocationCode: boolean;
  resultLimit: ResultLimit;
  keywordMode: KeywordMode;
  clickstream: boolean;
  sortField: SortField;
  sortDir: SortDir;
  getOpenKeywordTabs?: () => readonly OpenKeywordTabInput[];
  keywordTabsLimit?: number;
  /**
   * Called when the user submits the search form. Lets the caller decide
   * whether the submission opens tabs or just rewrites the URL — the
   * controller stays agnostic.
   */
  onFormSubmit: (value: KeywordControlsValues) => void;
};

/**
 * `targetArea` is a separate parameter (not folded into `input`) so
 * `KeywordResearchControllerInput` -- and therefore `KeywordResearchPage`'s
 * own `Props` type, which every route caller already supplies -- stays
 * unchanged; only `KeywordResearchPage` itself needs to thread the header
 * ScopeControl's area through.
 */
export function useKeywordResearchController(
  input: KeywordResearchControllerInput,
  targetArea: TargetArea,
) {
  const { locationCode, setPreferredLocationCode } =
    useResolvedKeywordLocation(input);
  const {
    filtersForm,
    values: filterValues,
    resetFilters: resetFilterFields,
  } = useLocalKeywordFilters(input.projectId);
  // Keyword Magic-style group slice; lives beside the form filters so exports,
  // pagination, and the mobile list all see the same filtered rows.
  const [groupTerm, setGroupTerm] = useState<string | null>(null);
  const resetFilters = useCallback(() => {
    resetFilterFields();
    setGroupTerm(null);
  }, [resetFilterFields]);
  const uiState = useKeywordUiState(
    Object.values(filterValues).some((v) => v.trim() !== ""),
  );
  const {
    selectedRows,
    setSelectedRows,
    clearSelection,
    toggleRowSelection,
    toggleAllRows,
  } = useKeywordSelection();
  const {
    setSerpKeyword,
    serpPage,
    setSerpPage,
    SERP_PAGE_SIZE,
    serpQuery,
    serpResults,
    activeSerpKeyword,
    serpLoading,
    serpError,
  } = useKeywordSerpAnalysis(input.projectId, locationCode);

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useSearchHistory(input.projectId);

  const {
    matchedRun,
    sessionRun,
    recordRun,
    autoRestoreAllowed,
    dismissAutoRestore,
  } = useKeywordSessionRuns({
    projectId: input.projectId,
    keywordInput: input.keywordInput,
    locationCode,
    resultLimit: input.resultLimit,
    mode: input.keywordMode,
    clickstream: input.clickstream,
    targetArea,
  });

  const {
    rows,
    hasSearched,
    lastSearchError,
    lastResultSource,
    lastUsedFallback,
    lastSearchKeyword,
    lastSearchLocationCode,
    researchError,
    researchMutationError,
    searchedKeyword,
    isLoading,
    retryResearch,
    restoredRun,
    selectedRunId,
    setSelectedRunId,
  } = useKeywordResearchData(
    {
      projectId: input.projectId,
      keywordInput: input.keywordInput,
      locationCode,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
    },
    addSearch,
    sessionRun,
    autoRestoreAllowed,
  );
  // The URL (the active tab) names a search, yet nothing is on screen or on
  // its way for it: a tab kept from an earlier visit, or one whose result is
  // no longer cached. It is not loaded -- not empty -- and the page asks
  // before re-running a metered search.
  const searchNotLoaded =
    input.keywordInput.trim() !== "" && !hasSearched && !isLoading;
  const setSearchParams = useKeywordSearchParams();
  const saveMutation = useKeywordSaveMutation(input.projectId);

  const activeSearchKey = input.keywordInput.trim()
    ? buildKeywordSearchKey({
        keyword: input.keywordInput,
        locationCode,
        resultLimit: input.resultLimit,
        mode: input.keywordMode,
        clickstream: input.clickstream,
      })
    : null;

  const previousSearchKeyRef = useRef<string | null>(null);
  const clearActiveKeywordResult = useCallback(() => {
    clearSelection();
    uiState.setSelectedKeyword(null);
    setSerpKeyword(null);
    setSerpPage(0);
    setGroupTerm(null);
  }, [clearSelection, setSerpKeyword, setSerpPage, uiState]);

  const onFormSubmit = input.onFormSubmit;
  const controlsForm = useKeywordControlsForm(
    {
      ...input,
      externalInputKey: JSON.stringify([
        input.projectId,
        input.keywordInput,
        input.locationCode,
        input.hasExplicitLocationCode,
        input.resultLimit,
        input.keywordMode,
        input.clickstream,
      ]),
      locationCode,
      getOpenKeywordTabs: input.getOpenKeywordTabs,
      keywordTabsLimit: input.keywordTabsLimit,
    },
    (value) => {
      setPreferredLocationCode(value.locationCode);
      recordRun(value);
      onFormSubmit(value);
    },
  );

  // The URL is the source of truth for paid keyword research queries. This
  // effect only resets UI state around a new query key; TanStack Query owns the
  // actual fetch, cache, dedupe, and error lifecycle.
  useEffect(() => {
    if (activeSearchKey === previousSearchKeyRef.current) return;
    previousSearchKeyRef.current = activeSearchKey;

    clearActiveKeywordResult();
  }, [activeSearchKey, clearActiveKeywordResult]);

  // Fit is derived from this project's business profile -- one free D1 read
  // plus pure string work over rows already on screen (see useProjectProfile
  // and keywordFit.ts). No metered provider is reachable from here, which is
  // what lets every row carry a verdict on render rather than behind a button.
  const { profile } = useProjectProfile(input.projectId);
  const keywordsForFit = useMemo(() => rows.map((row) => row.keyword), [rows]);
  const rulesFit = useKeywordFit(profile, keywordsForFit);
  const [hideWrongFit, setHideWrongFit] = useState(false);

  // The optional semantic pass, layered OVER the free rules verdicts rather
  // than replacing them: a keyword the model didn't reach keeps its rules
  // label instead of losing one. Runs only from an explicit click.
  const refineFit = useRefineKeywordFit(input.projectId);
  // `?? NO_AI_VERDICTS` rather than `?? []`: a fresh array literal every
  // render would defeat the memo below, re-merging the whole result set on
  // each keystroke in the filter fields.
  const aiVerdicts = refineFit.data?.verdicts ?? NO_AI_VERDICTS;
  const fit = useMemo(
    () => mergeFitVerdicts(rulesFit, aiVerdicts),
    [rulesFit, aiVerdicts],
  );
  const runFitRefinement = useCallback(() => {
    if (keywordsForFit.length > 0) refineFit.mutate(keywordsForFit);
  }, [keywordsForFit, refineFit]);

  const { filteredRows, activeFilterCount, wrongFitCount } =
    useKeywordFiltering({
      rows,
      filters: filterValues,
      groupTerm,
      sortField: input.sortField,
      sortDir: input.sortDir,
      fit,
      hideWrongFit,
    });

  // Term groups are cut from the full result set (not the filtered rows), so
  // the rail stays stable while the user slices with it.
  const keywordGroups = useMemo(
    () => extractKeywordGroups(rows, searchedKeyword ?? ""),
    [rows, searchedKeyword],
  );

  const { showApproximateMatchNotice, overviewKeyword } =
    useKeywordOverviewState({
      rows,
      searchedKeyword,
      selectedKeyword: uiState.selectedKeyword,
      hasSearched,
      isLoading,
      lastSearchError,
      keywordMode: input.keywordMode,
    });

  const retrySearch = useCallback(() => {
    void retryResearch();
  }, [retryResearch]);

  const handleSearchSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void controlsForm.handleSubmit();
    },
    [controlsForm],
  );

  const toggleSort = useCallback(
    (field: SortField) => {
      setSearchParams(getNextSortParams(input.sortField, input.sortDir, field));
    },
    [input.sortDir, input.sortField, setSearchParams],
  );

  const { handleSaveKeywords, confirmSave, exportCsv, sheetsExportRows } =
    useSaveAndExportActions({
      selectedRows,
      rows,
      filteredRows,
      input,
      saveKeywordsMutate: saveMutation.mutate,
      setShowSaveDialog: uiState.setShowSaveDialog,
    });

  const handleToggleAllRows = () => {
    toggleAllRows(filteredRows.map((row) => row.keyword));
  };

  const handleRowClick = (row: KeywordResearchRow) => {
    captureClientEvent("keyword_research:serp_open");
    uiState.setSelectedKeyword(row);
    setSerpKeyword(row.keyword);
    setSerpPage(0);
  };

  // Defect 1 fix: when the search on screen was not run THIS session, fall
  // back to whatever geo bundle the restored search itself persisted -- never
  // re-derive from the live scope control, and never reconstruct from a
  // bare stored locationCode (see `parseRestoredKeywordResearchGeo`'s own
  // doc comment). The on-screen session run's own capture always wins.
  const researchGeo =
    matchedRun?.geo ??
    (restoredRun ? parseRestoredKeywordResearchGeo(restoredRun.params) : null);

  return {
    restoredRun,
    selectedRunId,
    setSelectedRunId,
    activeFilterCount,
    activeSerpKeyword,
    confirmSave,
    controlsForm,
    fit,
    hideWrongFit,
    setHideWrongFit,
    wrongFitCount,
    runFitRefinement,
    fitRefinement: refineFit,
    // The geo CAPTURED for the run whose rows/verdict are on screen right
    // now -- null before the first search AND before any restore. Consumers
    // must read this, not `useTargetAreaScope` live, when labeling
    // volume/difficulty.
    researchGeo,
    exportCsv,
    sheetsExportRows,
    filteredRows,
    filtersForm,
    groupTerm,
    setGroupTerm,
    keywordGroups,
    handleRowClick,
    handleSaveKeywords,
    handleSearchSubmit,
    hasSearched,
    // The URL names a search this session has no result for (an older tab
    // whose result is no longer cached): the page asks before re-running it.
    searchNotLoaded,
    dismissAutoRestore,
    history,
    historyLoaded,
    isLoading,
    lastResultSource,
    lastSearchError,
    lastSearchKeyword,
    lastSearchLocationCode,
    lastUsedFallback,
    mobileTab: uiState.mobileTab,
    overviewKeyword,
    removeHistoryItem,
    researchError,
    researchMutationError,
    retrySearch,
    resetFilters,
    rows,
    searchedKeyword,
    selectedRows,
    serpError,
    serpLoading,
    serpPage,
    serpQuery,
    serpResults,
    setMobileTab: uiState.setMobileTab,
    setSelectedRows,
    setSerpPage,
    setShowFilters: uiState.setShowFilters,
    setShowSaveDialog: uiState.setShowSaveDialog,
    showApproximateMatchNotice,
    showFilters: uiState.showFilters,
    showSaveDialog: uiState.showSaveDialog,
    sortDir: input.sortDir,
    sortField: input.sortField,
    toggleAllRows: handleToggleAllRows,
    toggleRowSelection,
    toggleSort,
    // Exposed so the SERP panel's own "Analyze this SERP" control can start a
    // run. Selecting a keyword for the free OVERVIEW panel and fetching its
    // (metered) SERP are separate acts; only the second goes through here.
    setSerpKeyword,
    SERP_PAGE_SIZE,
  };
}
