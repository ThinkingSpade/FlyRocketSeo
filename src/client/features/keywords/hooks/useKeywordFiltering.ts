import { useMemo } from "react";
import { sortBy } from "remeda";
import { parseTerms } from "@/client/features/keywords/utils";
import { keywordHasTerm } from "@/client/features/keywords/keywordGroups";
import type { KeywordResearchRow } from "@/types/keywords";
import type { KeywordFilterValues } from "@/client/features/keywords/keywordResearchTypes";
import type { SortDir, SortField } from "@/client/features/keywords/components";
import type { FitResult } from "@/shared/keyword-fit/keywordFit";

/** Empty when the project has no usable profile -- see `useKeywordFit`. */
export type FitMap = ReadonlyMap<string, FitResult>;

const EMPTY_FIT: FitMap = new Map<string, FitResult>();

function isWrongCustomer(fit: FitMap, keyword: string): boolean {
  return fit.get(keyword)?.verdict === "wrong-customer";
}

// Ubersuggest-style "Questions" view: keywords phrased as a question.
const QUESTION_PATTERN =
  /^(how|what|why|when|where|which|who|whose|can|could|do|does|did|is|are|was|will|would|should)\b/;

function applyKeywordFiltersAndSort(params: {
  rows: KeywordResearchRow[];
  filters: KeywordFilterValues;
  groupTerm: string | null;
  sortField: SortField;
  sortDir: SortDir;
  fit: FitMap;
  hideWrongFit: boolean;
}): KeywordResearchRow[] {
  const includeTerms = parseTerms(params.filters.include);
  const excludeTerms = parseTerms(params.filters.exclude);
  const questionsOnly = params.filters.questionsOnly.trim() !== "";
  const groupTerm = params.groupTerm;

  const filtered = params.rows.filter((row) => {
    const haystack = row.keyword.toLowerCase();
    if (questionsOnly && !QUESTION_PATTERN.test(haystack)) {
      return false;
    }
    if (groupTerm && !keywordHasTerm(row.keyword, groupTerm)) {
      return false;
    }
    // Opt-in only. The default is to DEMOTE a wrong-fit keyword (below), not
    // to drop it: a keyword aimed at someone else's customer is still
    // sometimes a deliberate content play, and silently removing rows the
    // user paid to fetch is how a tool loses their trust.
    if (params.hideWrongFit && isWrongCustomer(params.fit, row.keyword)) {
      return false;
    }
    if (
      includeTerms.length > 0 &&
      !includeTerms.every((term) => haystack.includes(term))
    ) {
      return false;
    }
    if (excludeTerms.some((term) => haystack.includes(term))) {
      return false;
    }

    const vol = row.searchVolume ?? 0;
    const cpc = row.cpc ?? 0;
    const kd = row.keywordDifficulty ?? 0;

    if (params.filters.minVol && vol < Number(params.filters.minVol))
      return false;
    if (params.filters.maxVol && vol > Number(params.filters.maxVol))
      return false;
    if (params.filters.minCpc && cpc < Number(params.filters.minCpc))
      return false;
    if (params.filters.maxCpc && cpc > Number(params.filters.maxCpc))
      return false;
    if (params.filters.minKd && kd < Number(params.filters.minKd)) return false;
    if (params.filters.maxKd && kd > Number(params.filters.maxKd)) return false;
    return true;
  });

  // Fit outranks whichever column the user sorted by, so a wrong-customer
  // keyword can never occupy the top of the table however it scores. It is a
  // leading sort key rather than a separate pass because `sortBy` is stable
  // in one call but composing two calls is not: sorting by volume and then
  // partitioning by fit would scramble the volume order within each block.
  const fitRank = (row: KeywordResearchRow) =>
    isWrongCustomer(params.fit, row.keyword) ? 1 : 0;

  if (params.sortField === "keyword") {
    return sortBy(
      filtered,
      [fitRank, "asc"],
      [(row) => row.keyword, params.sortDir],
    );
  }
  if (params.sortField === "searchVolume") {
    return sortBy(
      filtered,
      [fitRank, "asc"],
      [(row) => row.searchVolume ?? -1, params.sortDir],
    );
  }
  if (params.sortField === "cpc") {
    return sortBy(
      filtered,
      [fitRank, "asc"],
      [(row) => row.cpc ?? -1, params.sortDir],
    );
  }
  if (params.sortField === "competition") {
    return sortBy(
      filtered,
      [fitRank, "asc"],
      [(row) => row.competition ?? -1, params.sortDir],
    );
  }

  return sortBy(
    filtered,
    [fitRank, "asc"],
    [(row) => row.keywordDifficulty ?? -1, params.sortDir],
  );
}

export function useKeywordFiltering(params: {
  rows: KeywordResearchRow[];
  filters: KeywordFilterValues;
  groupTerm: string | null;
  sortField: SortField;
  sortDir: SortDir;
  /** Omitted (or empty) when the project has no usable business profile, in
   *  which case fit affects neither the filter nor the sort. */
  fit?: FitMap;
  hideWrongFit?: boolean;
}) {
  const fit = params.fit ?? EMPTY_FIT;
  const hideWrongFit = params.hideWrongFit ?? false;

  const filteredRows = useMemo(
    () =>
      applyKeywordFiltersAndSort({
        rows: params.rows,
        filters: params.filters,
        groupTerm: params.groupTerm,
        sortField: params.sortField,
        sortDir: params.sortDir,
        fit,
        hideWrongFit,
      }),
    [
      params.filters,
      params.groupTerm,
      params.rows,
      params.sortDir,
      params.sortField,
      fit,
      hideWrongFit,
    ],
  );

  const activeFilterCount = useMemo(
    () =>
      Object.values(params.filters).filter((value) => value.trim() !== "")
        .length,
    [params.filters],
  );

  // Counted over the UNFILTERED rows on purpose: this number labels the
  // toggle that does the hiding, so counting post-filter would make it drop
  // to zero the moment it was switched on.
  const wrongFitCount = useMemo(
    () => params.rows.filter((row) => isWrongCustomer(fit, row.keyword)).length,
    [params.rows, fit],
  );

  return {
    filteredRows,
    activeFilterCount,
    wrongFitCount,
  };
}
