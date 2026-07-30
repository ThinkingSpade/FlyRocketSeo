import { useCallback, useEffect, useRef } from "react";
import { useAuthorizedRun } from "@/client/lib/useMeteredQuery";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import {
  buildBacklinksAuthorizationKey,
  selectActiveBacklinksFilters,
} from "./backlinksAuthorizationKey";
import {
  useBacklinksFilters,
  type BacklinksFiltersAppliedHandler,
} from "./useBacklinksFilters";

/**
 * The filters and the run authorization together, because neither can be built
 * without the other.
 *
 * A DataForSEO backlinks call is billed, and `useMeteredQuery` only fires for the
 * exact key it was authorized for. The active filters are part of that key on
 * purpose: a filtered call is a different request at a different price, so an
 * authorization for the unfiltered view must not silently cover it.
 *
 * The consequence is the bug this hook exists to fix. Applying a filter changed
 * the key and therefore DE-authorized the run — every metered query switched off
 * and the user watched results they had already paid for disappear, with no route
 * back except running the search again and paying again. Apply is an explicit
 * request for filtered data, so it now authorizes the run it just described.
 *
 * The circularity is real, not incidental: the key is built from the filters, the
 * authorization is built from the key, and the filter handler needs the
 * authorization. It is resolved with a latest-ref rather than by notifying from
 * the filter panel, because the panel is only today's sole caller of `apply` —
 * routing the signal through the hook means the next caller cannot skip it.
 */
export function useBacklinksRunAuthorization({
  projectId,
  searchState,
  goToFirstPage,
}: {
  projectId: string;
  searchState: BacklinksSearchState;
  /** A filter change resets paging, and the key includes the page — so the
   *  authorization and the navigation have to agree on page 1. */
  goToFirstPage: () => void;
}) {
  const appliedRef = useRef<BacklinksFiltersAppliedHandler>(() => {});
  const notifyFiltersApplied = useCallback<BacklinksFiltersAppliedHandler>(
    (tab, payload) => appliedRef.current(tab, payload),
    [],
  );

  const filters = useBacklinksFilters(projectId, notifyFiltersApplied);
  const currentSearchKey = buildBacklinksAuthorizationKey(
    projectId,
    searchState,
    selectActiveBacklinksFilters(searchState.tab, filters),
  );
  const run = useAuthorizedRun(currentSearchKey);

  useEffect(() => {
    appliedRef.current = (tab, payload) => {
      // Keyed on the payload the handler was handed, never on `filters` — that
      // is still one render behind while this runs, so reading it would
      // authorize the filter set the user just replaced.
      run.authorize(
        buildBacklinksAuthorizationKey(
          projectId,
          { ...searchState, tab, page: 1 },
          payload,
        ),
      );
      goToFirstPage();
    };
  });

  return { filters, run };
}
