import { useMemo } from "react";
import type { KeywordMode } from "@/client/features/keywords/keywordResearchTypes";
import type { KeywordResearchRow } from "@/types/keywords";

/**
 * `visibleRows` must already be the relevance/toggle-aware set (see
 * `buildKeywordRelevanceView`), not the raw fetch — the fallback below picks
 * `visibleRows[0]` when nothing matches the seed exactly, and that fallback
 * is only safe to show in the Overview card if it's a row the table is
 * actually rendering, not one collapsed behind the off-topic toggle.
 */
export function useKeywordOverviewState({
  visibleRows,
  searchedKeyword,
  selectedKeyword,
  hasSearched,
  isLoading,
  lastSearchError,
  keywordMode,
}: {
  visibleRows: KeywordResearchRow[];
  searchedKeyword: string;
  selectedKeyword: KeywordResearchRow | null;
  hasSearched: boolean;
  isLoading: boolean;
  lastSearchError: boolean;
  keywordMode: KeywordMode;
}) {
  const hasExactMatchInResults = useMemo(() => {
    const normalizedSeed = searchedKeyword.trim().toLowerCase();
    if (!normalizedSeed || visibleRows.length === 0) return false;
    return visibleRows.some(
      (row) => row.keyword.trim().toLowerCase() === normalizedSeed,
    );
  }, [visibleRows, searchedKeyword]);

  const showApproximateMatchNotice =
    hasSearched &&
    !isLoading &&
    !lastSearchError &&
    visibleRows.length > 0 &&
    searchedKeyword.trim() !== "" &&
    !hasExactMatchInResults &&
    keywordMode !== "auto";

  const overviewKeyword: KeywordResearchRow | null = useMemo(() => {
    if (selectedKeyword) return selectedKeyword;
    if (searchedKeyword && visibleRows.length > 0) {
      const seed = visibleRows.find(
        (row) => row.keyword.toLowerCase() === searchedKeyword.toLowerCase(),
      );
      if (seed) return seed;
    }
    return visibleRows.length > 0 ? visibleRows[0] : null;
  }, [selectedKeyword, searchedKeyword, visibleRows]);

  return { showApproximateMatchNotice, overviewKeyword };
}
