import {
  toAnchorsFiltersPayload,
  toBacklinksFiltersPayload,
  toReferringDomainsFiltersPayload,
  toTopPagesFiltersPayload,
  type AnchorsFilterValues,
  type BacklinksTabFilterValues,
  type ReferringDomainsFilterValues,
  type TopPagesFilterValues,
} from "./backlinksFilterTypes";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import type { AppliedBacklinksFilters } from "./useBacklinksFilters";
import { createMeteredRunKey } from "@/client/lib/useMeteredQuery";

/**
 * Just the applied values, per tab.
 *
 * Narrower than `BacklinksFiltersState` on purpose: the key depends on the
 * values and nothing else, so nothing here can accidentally start keying on a
 * setter or a panel-open flag. `BacklinksFiltersState` satisfies it structurally.
 */
type AppliedFilterValuesByTab = {
  backlinks: { values: BacklinksTabFilterValues };
  domains: { values: ReferringDomainsFilterValues };
  pages: { values: TopPagesFilterValues };
  anchors: { values: AnchorsFilterValues };
};

/**
 * The applied filters for whichever tab is showing.
 *
 * Separate from the key builder so a caller that already knows the payload --
 * the Apply handler, which has the values one render before the hook does -- can
 * pass it straight in instead of reading stale state.
 */
export function selectActiveBacklinksFilters(
  tab: BacklinksSearchState["tab"],
  filters: AppliedFilterValuesByTab,
): AppliedBacklinksFilters {
  return tab === "backlinks"
    ? toBacklinksFiltersPayload(filters.backlinks.values)
    : tab === "domains"
      ? toReferringDomainsFiltersPayload(filters.domains.values)
      : tab === "pages"
        ? toTopPagesFiltersPayload(filters.pages.values)
        : toAnchorsFiltersPayload(filters.anchors.values);
}

/**
 * The identity of one paid backlinks run.
 *
 * The filters are part of it deliberately: a filtered request is a different
 * DataForSEO call with a different price, so an authorization for the unfiltered
 * view must not silently cover it. The consequence is that changing a filter
 * invalidates the current authorization, which is why applying one has to
 * re-authorize explicitly -- see `useBacklinksFilters`' `onApplied`.
 */
export function buildBacklinksAuthorizationKey(
  projectId: string,
  searchState: BacklinksSearchState,
  activeFilters: AppliedBacklinksFilters,
): string {
  return createMeteredRunKey(
    projectId,
    searchState.target,
    searchState.scope,
    searchState.tab,
    searchState.page,
    searchState.pageSize,
    searchState.sort,
    searchState.order,
    searchState.view,
    activeFilters,
  );
}
