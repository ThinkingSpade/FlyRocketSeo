import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BacklinksNavigate,
  BacklinksSearchState,
} from "./backlinksPageTypes";
import type { BacklinksTabFilterValues } from "./backlinksFilterTypes";
import {
  BACKLINKS_RESULTS_REGION_ID,
  breakdownRowElementId,
  type CategoryFilterField,
} from "./backlinksCategoryFilters";
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
  // Where the current drill-down was launched from, so the user can be put
  // back there. Kept even after the chip is cleared: having followed a link,
  // you still want the way back.
  const [origin, setOrigin] = useState<BreakdownOrigin | null>(null);

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
      setOrigin({ field, rawValue });
      // Re-selecting the applied value changes no filter, but the user still
      // asked to see those links, so honour the navigation without refetching.
      if (appliedFilters[field] !== rawValue) {
        commitFilterChange({ ...appliedFilters, [field]: rawValue });
      }
      focusResultsRegion();
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

  const returnToBreakdown = useCallback(() => {
    if (!origin) return;
    const row = document.getElementById(
      breakdownRowElementId(origin.field, origin.rawValue),
    );
    // The originating row can be gone -- a re-run may return different values --
    // so fall back to the section rather than doing nothing.
    const fallback = document.getElementById(BREAKDOWN_SECTION_ID);
    const destination = row ?? fallback;
    if (!destination) return;
    destination.scrollIntoView({
      block: row ? "center" : "start",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    destination.focus({ preventScroll: true });
  }, [origin]);

  return {
    rowsReleased: released,
    selectCategory,
    clearCategory,
    origin,
    returnToBreakdown,
  };
}

export type BreakdownOrigin = { field: CategoryFilterField; rawValue: string };

const BREAKDOWN_SECTION_ID = "backlinks-profile-composition";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Moves to the table once the new state has committed -- not once the network
 * settles. Focus lands on the region rather than the first row, because that
 * row is replaced when the response arrives.
 */
function focusResultsRegion() {
  const region = document.getElementById(BACKLINKS_RESULTS_REGION_ID);
  if (!region) return;
  region.scrollIntoView({
    block: "start",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
  region.focus({ preventScroll: true });
}
