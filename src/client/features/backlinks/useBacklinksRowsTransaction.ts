import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BacklinksNavigate,
  BacklinksSearchState,
} from "./backlinksPageTypes";
import type { BacklinksTabFilterValues } from "./backlinksFilterTypes";
import type { CategoryFilterField } from "./backlinksCategoryFilters";
import {
  buildRowsSignature,
  isRowsQueryReleased,
  isRowsTransactionStale,
  rowsSignaturesMatch,
  type RowsRequestSignature,
} from "./backlinksRowsTransaction";

type ApplyFilters = (next: BacklinksTabFilterValues) => void;

/**
 * Owns every change that alters the paid row query, so each one costs exactly
 * one request.
 *
 * The four entry points -- a breakdown drill-down, removing a chip, the filter
 * panel's Apply, and Clear all -- all move more than one piece of state at
 * once. Routing them through here means the filter write and the single
 * `navigate` happen together and the query stays closed until both have
 * landed. See `backlinksRowsTransaction` for why the intermediate states are
 * billable.
 */
export function useBacklinksRowsTransaction({
  searchState,
  hasTarget,
  appliedFilters,
  applyFilters,
  navigate,
}: {
  searchState: BacklinksSearchState;
  hasTarget: boolean;
  appliedFilters: BacklinksTabFilterValues;
  applyFilters: ApplyFilters;
  navigate: BacklinksNavigate;
}) {
  const [pending, setPending] = useState<RowsRequestSignature | null>(null);

  const current = useMemo(
    () =>
      buildRowsSignature({
        target: searchState.target,
        scope: searchState.scope,
        tab: searchState.tab,
        view: searchState.view,
        page: searchState.page,
        pageSize: searchState.pageSize,
        filters: appliedFilters,
      }),
    [
      appliedFilters,
      searchState.page,
      searchState.pageSize,
      searchState.scope,
      searchState.tab,
      searchState.target,
      searchState.view,
    ],
  );

  // Clearing on arrival keeps `pending` from outliving its change. Clearing on
  // staleness is what stops a superseded navigation from holding the table off
  // permanently.
  useEffect(() => {
    setPending((previous) => {
      if (!previous) return previous;
      if (isRowsTransactionStale(previous, current)) return null;
      return rowsSignaturesMatch(previous, current) ? null : previous;
    });
  }, [current]);

  // Computed from `pending` rather than the effect's result, so the query
  // enables on the render the state arrives, not one render later.
  const released = hasTarget && isRowsQueryReleased(pending, current);

  /**
   * Commit a filter change and the navigation it implies as one step, landing
   * on the Backlinks sub-tab in the All links view at page 1.
   *
   * All links matters beyond presentation: the one-per-domain view collapses a
   * domain's links to its strongest, so a slice of 14 links could show as 3
   * rows and read as a broken filter.
   */
  const commitFilterChange = useCallback(
    (nextFilters: BacklinksTabFilterValues) => {
      const keepSort = searchState.tab === "backlinks";
      setPending(
        buildRowsSignature({
          target: searchState.target,
          scope: searchState.scope,
          tab: "backlinks",
          view: "all",
          page: 1,
          pageSize: searchState.pageSize,
          filters: nextFilters,
        }),
      );
      applyFilters(nextFilters);
      navigate({
        search: (prev) => ({
          ...prev,
          tab: undefined,
          view: "all" as const,
          page: undefined,
          sort: keepSort ? prev.sort : undefined,
          order: keepSort ? prev.order : undefined,
        }),
        replace: true,
      });
    },
    [
      applyFilters,
      navigate,
      searchState.pageSize,
      searchState.scope,
      searchState.tab,
      searchState.target,
    ],
  );

  /** Selecting a value replaces that dimension; other dimensions still apply. */
  const selectCategory = useCallback(
    (field: CategoryFilterField, rawValue: string) => {
      if (appliedFilters[field] === rawValue) return;
      commitFilterChange({ ...appliedFilters, [field]: rawValue });
    },
    [appliedFilters, commitFilterChange],
  );

  const clearCategory = useCallback(
    (field: CategoryFilterField) => {
      if (appliedFilters[field] === "") return;
      commitFilterChange({ ...appliedFilters, [field]: "" });
    },
    [appliedFilters, commitFilterChange],
  );

  return { rowsReleased: released, selectCategory, clearCategory };
}
