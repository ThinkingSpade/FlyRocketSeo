import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
  buildKeywordRelevanceView,
  isHiddenByOffTopicCollapse,
} from "./keywordRelevanceView";
import {
  useKeywordSaveMutation,
  useKeywordSearchParams,
  useKeywordUiState,
  useResolvedKeywordLocation,
} from "./keywordControllerInternals";
import { useKeywordOverviewState } from "./useKeywordOverviewState";

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

export function useKeywordResearchController(
  input: KeywordResearchControllerInput,
) {
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
    researchQuery,
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
  const handledSerpSearchKeyRef = useRef<string | null>(null);

  // Off-topic rows stay collapsed by default for every search; a reveal from
  // one query shouldn't carry over and silently unhide drift on the next.
  const [showOffTopic, setShowOffTopic] = useState(false);

  const clearActiveKeywordResult = useCallback(() => {
    clearSelection();
    uiState.setSelectedKeyword(null);
    setSerpKeyword(null);
    setSerpPage(0);
    setGroupTerm(null);
    setShowOffTopic(false);
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
      onFormSubmit(value);
    },
  );

  // The URL is the source of truth for paid keyword research queries. This
  // effect only resets UI state around a new query key; TanStack Query owns the
  // actual fetch, cache, dedupe, and error lifecycle.
  useEffect(() => {
    if (activeSearchKey === previousSearchKeyRef.current) return;
    previousSearchKeyRef.current = activeSearchKey;
    handledSerpSearchKeyRef.current = null;

    clearActiveKeywordResult();
  }, [activeSearchKey, clearActiveKeywordResult]);

  useEffect(() => {
    if (!activeSearchKey || !researchQuery.isSuccess) return;
    if (handledSerpSearchKeyRef.current === activeSearchKey) return;

    handledSerpSearchKeyRef.current = activeSearchKey;
    setSerpKeyword(rows.length > 0 ? searchedKeyword : null);
    setSerpPage(0);
  }, [
    activeSearchKey,
    researchQuery.isSuccess,
    rows.length,
    searchedKeyword,
    setSerpKeyword,
    setSerpPage,
  ]);

  // Partitioned from the full fetch, before filters/sort/grouping ever see the
  // rows, so a search's off-topic drift can't leak into the table by default.
  // Everything relevance-derived (the rail's groups, the PPC panel, the
  // overview fallback below) reads relevanceVisibleRows — never raw rows —
  // so the Show/Hide toggle moves every one of those views together instead
  // of only the table.
  const { offTopic, relevanceVisibleRows, keywordGroups } = useMemo(
    () => buildKeywordRelevanceView(rows, searchedKeyword, showOffTopic),
    [rows, searchedKeyword, showOffTopic],
  );

  // Collapsing has to drop any off-topic row the user selected while they were
  // revealed. Otherwise the count reads "3 of 2 selected" and Save persists a
  // keyword the table is no longer showing.
  const toggleOffTopic = useCallback(() => {
    setShowOffTopic((current) => {
      if (current) {
        const hidden = new Set(offTopic.map((row) => row.keyword));
        setSelectedRows((previous) => {
          const next = new Set(
            [...previous].filter((keyword) => !hidden.has(keyword)),
          );
          return next.size === previous.size ? previous : next;
        });
      }
      return !current;
    });
  }, [offTopic, setSelectedRows]);

  const { filteredRows, activeFilterCount } = useKeywordFiltering({
    rows: relevanceVisibleRows,
    filters: filterValues,
    groupTerm,
    sortField: input.sortField,
    sortDir: input.sortDir,
  });

  // See isHiddenByOffTopicCollapse: distinguishes "a filter matched nothing"
  // from "the collapse hid every row" so the table's empty state can say the
  // right one instead of blaming filters that were never touched.
  const hiddenByOffTopicCollapse = isHiddenByOffTopicCollapse({
    offTopicCount: offTopic.length,
    visibleRowCount: relevanceVisibleRows.length,
    activeFilterCount,
    groupTerm,
  });

  const { showApproximateMatchNotice, overviewKeyword } =
    useKeywordOverviewState({
      visibleRows: relevanceVisibleRows,
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
    hiddenByOffTopicCollapse,
    history,
    historyLoaded,
    isLoading,
    lastResultSource,
    lastSearchError,
    lastSearchKeyword,
    lastSearchLocationCode,
    lastUsedFallback,
    mobileTab: uiState.mobileTab,
    offTopicCount: offTopic.length,
    overviewKeyword,
    relevanceVisibleRows,
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
    toggleOffTopic,
    setShowSaveDialog: uiState.setShowSaveDialog,
    showApproximateMatchNotice,
    showFilters: uiState.showFilters,
    showOffTopic,
    showSaveDialog: uiState.showSaveDialog,
    sortDir: input.sortDir,
    sortField: input.sortField,
    toggleAllRows: handleToggleAllRows,
    toggleRowSelection,
    toggleSort,
    SERP_PAGE_SIZE,
  };
}
