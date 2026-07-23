import {
  extractKeywordGroups,
  type KeywordGroup,
} from "@/client/features/keywords/keywordGroups";
import { partitionByRelevance } from "@/client/features/keywords/offTopicKeywords";
import type { KeywordResearchRow } from "@/types/keywords";

type KeywordRelevanceView = {
  onTopic: KeywordResearchRow[];
  offTopic: KeywordResearchRow[];
  /** What every relevance-aware consumer (table, rail, PPC panel, overview
   *  card) should read instead of raw rows: on-topic rows, plus the
   *  off-topic ones only once the toggle reveals them. */
  relevanceVisibleRows: KeywordResearchRow[];
  keywordGroups: KeywordGroup[];
};

/**
 * The one seam every relevance-derived view is meant to read through. A
 * review found three consumers re-deriving "what's visible" themselves by
 * reading raw `rows`, each disagreeing with the table as a result — doing the
 * derivation once here, instead of at each call site, is what makes that a
 * structural impossibility rather than a habit every new consumer has to
 * remember.
 */
export function buildKeywordRelevanceView(
  rows: KeywordResearchRow[],
  searchedKeyword: string,
  showOffTopic: boolean,
): KeywordRelevanceView {
  const { onTopic, offTopic } = partitionByRelevance(rows, searchedKeyword);
  const relevanceVisibleRows = showOffTopic
    ? [...onTopic, ...offTopic]
    : onTopic;
  // Cut from the visible set (not the filtered rows), so the rail stays
  // stable while the user slices with a filter or a group term, but still
  // moves when Show/Hide changes what "visible" means.
  const keywordGroups = extractKeywordGroups(
    relevanceVisibleRows,
    searchedKeyword,
  );

  return { onTopic, offTopic, relevanceVisibleRows, keywordGroups };
}

/**
 * The table can end up empty for two unrelated reasons that need different
 * copy: a filter or group slice matching nothing (the table's original empty
 * state), or every row being off-topic while the collapse — not a filter —
 * is what hid them. Only the second gets its own message.
 */
export function isHiddenByOffTopicCollapse(params: {
  offTopicCount: number;
  visibleRowCount: number;
  activeFilterCount: number;
  groupTerm: string | null;
}): boolean {
  return (
    params.offTopicCount > 0 &&
    params.visibleRowCount === 0 &&
    params.activeFilterCount === 0 &&
    params.groupTerm == null
  );
}
