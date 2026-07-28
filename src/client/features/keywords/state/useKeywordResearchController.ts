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
import { resolveRunGeo } from "@/client/features/geo/resolveRunGeo";
import type { ResolvedGeo, TargetArea } from "@/shared/geo/types";

// Not exported: consumers read this off `KeywordResearchControllerState`
// (`ReturnType<typeof useKeywordResearchController>`) rather than importing
// the type directly -- knip flags an unused export.
//
/** The geo captured for the run currently in `authorizedResearchInput` --
 *  volume can go genuinely local (Google Ads); difficulty stays Labs-only
 *  national regardless (see resolveGeo.ts's NATIONAL_ONLY set). Bundled so
 *  the results view can label each column from ONE captured object, never
 *  by re-deriving from the live scope control. */
type KeywordResearchGeo = {
  volume: ResolvedGeo;
  difficulty: ResolvedGeo;
};

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
  const [authorizedResearchInput, setAuthorizedResearchInput] =
    useState<KeywordControlsValues | null>(null);
  // Captured in the SAME submit callback as `authorizedResearchInput` below,
  // never recomputed later from the live scope control -- see
  // resolveRunGeo.ts's own header for why that matters.
  const [authorizedGeo, setAuthorizedGeo] = useState<KeywordResearchGeo | null>(
    null,
  );
  const [researchRunNonce, setResearchRunNonce] = useState(0);
  const { locationCode, setPreferredLocationCode } =
    useResolvedKeywordLocation(input);
  const {
    filtersForm,
    values: filterValues,
    resetFilters: resetFilterFields,
  } = useLocalKeywordFilters();
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
    authorizedResearchInput
      ? {
          ...authorizedResearchInput,
          projectId: input.projectId,
          keywordInput: authorizedResearchInput.keyword,
          // Overridden with the CAPTURED geo's own locationCode -- a metro
          // when the confirmed target area applies, else unchanged from
          // whatever the form submitted. Never re-derived here from live
          // scope; `authorizedGeo` already froze that choice at submit time.
          locationCode:
            authorizedGeo?.volume.locationCode ??
            authorizedResearchInput.locationCode,
        }
      : null,
    researchRunNonce,
    authorizedGeo?.volume.languageCode ?? null,
  );
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
      locationCode,
      getOpenKeywordTabs: input.getOpenKeywordTabs,
      keywordTabsLimit: input.keywordTabsLimit,
    },
    (value) => {
      setPreferredLocationCode(value.locationCode);
      setAuthorizedResearchInput(value);
      // Captured HERE, at the exact moment this run is authorized -- the
      // form's own submitted locationCode is this run's session location,
      // matched against the CURRENT target area. A later scope change can
      // never retroactively relabel what already fetched.
      setAuthorizedGeo({
        volume: resolveRunGeo("keyword-volume", targetArea, value.locationCode),
        difficulty: resolveRunGeo(
          "keyword-difficulty",
          targetArea,
          value.locationCode,
        ),
      });
      setResearchRunNonce((previous) => previous + 1);
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

  const { filteredRows, activeFilterCount } = useKeywordFiltering({
    rows,
    filters: filterValues,
    groupTerm,
    sortField: input.sortField,
    sortDir: input.sortDir,
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

  return {
    restoredRun,
    selectedRunId,
    setSelectedRunId,
    activeFilterCount,
    activeSerpKeyword,
    confirmSave,
    controlsForm,
    // The geo CAPTURED for the run whose rows/verdict are on screen right
    // now -- null before the first search. Consumers must read this, not
    // `useTargetAreaScope` live, when labeling volume/difficulty.
    researchGeo: authorizedGeo,
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
    SERP_PAGE_SIZE,
  };
}
