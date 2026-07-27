import { useMemo } from "react";
import type {
  BacklinksPageProps,
  BacklinksSearchState,
} from "./backlinksPageTypes";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import {
  getBacklinksAnchors,
  getBacklinksOverview,
  getBacklinksReferringDomains,
  getBacklinksRows,
  getBacklinksTopPages,
} from "@/serverFunctions/backlinks";
import {
  anchorsSortFieldSchema,
  BACKLINKS_DEFAULT_SORT,
  backlinksRowsSortFieldSchema,
  referringDomainsSortFieldSchema,
  topPagesSortFieldSchema,
  type BacklinksSortOrder,
} from "@/types/schemas/backlinks";
import {
  toAnchorsFiltersPayload,
  toBacklinksFiltersPayload,
  toReferringDomainsFiltersPayload,
  toTopPagesFiltersPayload,
} from "./backlinksFilterTypes";
import type { BacklinksFiltersState } from "./useBacklinksFilters";
import { getPersistedBacklinksSearchScope } from "./backlinksSearchScope";
import {
  createMeteredRunKey,
  useMeteredQuery,
} from "@/client/lib/useMeteredQuery";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { useLastRunInput } from "@/client/features/insights/useLastRunInput";
import { resolvePrefill } from "@/client/features/insights/resolvePrefill";
import { useHandoff } from "@/client/features/insights/handoffStore";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The `extract` this tab hands to `useLastRunInput`: pulls the analyzed
 * target off the stored backlinks-overview result, which nests it under
 * `overview` (matching `backlinksOverviewCacheSchema`, not the result shape
 * itself). A shape that has drifted (or isn't this feature's result at all)
 * returns null rather than throwing — the tab simply has no last-run value to
 * offer, same contract as the hook itself.
 */
function extractStoredTarget(result: unknown): string | null {
  if (!isRecord(result)) return null;
  if (!isRecord(result.overview)) return null;
  return typeof result.overview.target === "string"
    ? result.overview.target
    : null;
}

/**
 * The URL param wins, then a domain carried from another tab, then what this
 * tab last ran, then the project's own domain (the same fallback
 * `AnalyzeDomainPrompt` already offers as an explicit click). There's no
 * domain-shaped suggestion source, so this kind always passes an empty
 * suggestions list. Lives alongside the rest of this page's supporting hooks
 * rather than in `BacklinksPage` itself to keep that component under this
 * file's line-count limit.
 */
export function useBacklinksTargetPrefill(
  projectId: string,
  target: string,
  projectDomain: string | null,
): string {
  const handoff = useHandoff(projectId);
  // BacklinksPage already imports RUN_FEATURES for its RecentRunsList; reuse
  // the same feature key so both read one cache entry.
  const lastRun = useLastRunInput(
    projectId,
    RUN_FEATURES.backlinks,
    extractStoredTarget,
  );
  return resolvePrefill({
    kind: "domain",
    searchParam: target,
    handoff,
    lastRun,
    suggestions: [],
    projectDefault: projectDomain,
  }).value;
}

type UseBacklinksPageDataArgs = {
  projectId: string;
  searchState: BacklinksSearchState;
  filters: BacklinksFiltersState;
  authorized: boolean;
  runNonce: number;
};

// Five-minute client staleness on top of the server's 6h R2 cache, so window
// refocus doesn't re-run the server functions for bytes that can't change.
const BACKLINKS_QUERY_STALE_TIME_MS = 5 * 60 * 1000;

function getBacklinksErrorMessage(
  error: unknown,
  fallback: string,
): string | null {
  if (!error) return null;
  if (getErrorCode(error) === "VALIDATION_ERROR") {
    return "Enter a valid domain or page URL.";
  }

  return getStandardErrorMessage(error, fallback);
}

/**
 * Maps the URL's sort/order params to a request's sortField/sortOrder pair.
 * The sort param is checked against the tab's allowed sort fields; anything
 * unexpected falls back to the tab's default sort.
 */
function toSort<T extends string>(
  sortParam: string | undefined,
  orderParam: BacklinksSortOrder | undefined,
  allowedFields: readonly T[],
  fallback: { field: T; order: BacklinksSortOrder },
): { field: T; order: BacklinksSortOrder } {
  const field = sortParam
    ? allowedFields.find((candidate) => candidate === sortParam)
    : undefined;
  if (!field) return fallback;
  return { field, order: orderParam ?? "desc" };
}

export function buildBacklinksAuthorizationKey(
  projectId: string,
  searchState: BacklinksSearchState,
  filters: BacklinksFiltersState,
): string {
  const activeFilters =
    searchState.tab === "backlinks"
      ? toBacklinksFiltersPayload(filters.backlinks.values)
      : searchState.tab === "domains"
        ? toReferringDomainsFiltersPayload(filters.domains.values)
        : searchState.tab === "pages"
          ? toTopPagesFiltersPayload(filters.pages.values)
          : toAnchorsFiltersPayload(filters.anchors.values);

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

export function useBacklinksPageData({
  projectId,
  searchState,
  filters,
  authorized,
  runNonce,
}: UseBacklinksPageDataArgs) {
  const searchCardInitialValues = useMemo(
    () => ({
      target: searchState.target,
      scope: searchState.scope,
    }),
    [searchState.scope, searchState.target],
  );

  const { target, scope, tab, page, pageSize, sort, order, view } = searchState;
  const rowsMode = view === "all" ? "as_is" : "one_per_domain";
  const targetReady = Boolean(target);
  const baseQueryKeyParts = [projectId, scope, target] as const;
  const pageInputBase = { projectId, target, scope, page, pageSize };

  const overviewQuery = useMeteredQuery({
    authorized,
    runNonce,
    queryKey: ["backlinksOverview", ...baseQueryKeyParts],
    enabled: targetReady,
    gcTime: BACKLINKS_QUERY_STALE_TIME_MS,
    queryFn: () => getBacklinksOverview({ data: { projectId, target, scope } }),
  });

  const rowsSort = toSort(
    sort,
    order,
    backlinksRowsSortFieldSchema.options,
    BACKLINKS_DEFAULT_SORT.backlinks,
  );
  const rowsFilters = useMemo(
    () => toBacklinksFiltersPayload(filters.backlinks.values),
    [filters.backlinks.values],
  );
  const rowsQuery = useMeteredQuery({
    authorized,
    runNonce,
    queryKey: [
      "backlinksRows",
      ...baseQueryKeyParts,
      page,
      pageSize,
      rowsSort.field,
      rowsSort.order,
      rowsFilters,
      rowsMode,
    ],
    enabled: targetReady && tab === "backlinks",
    gcTime: BACKLINKS_QUERY_STALE_TIME_MS,
    queryFn: () =>
      getBacklinksRows({
        data: {
          ...pageInputBase,
          sortField: rowsSort.field,
          sortOrder: rowsSort.order,
          filters: rowsFilters,
          mode: rowsMode,
        },
      }),
  });

  const domainsSort = toSort(
    sort,
    order,
    referringDomainsSortFieldSchema.options,
    BACKLINKS_DEFAULT_SORT.domains,
  );
  const domainsFilters = useMemo(
    () => toReferringDomainsFiltersPayload(filters.domains.values),
    [filters.domains.values],
  );
  const referringDomainsQuery = useMeteredQuery({
    authorized,
    runNonce,
    queryKey: [
      "backlinksReferringDomains",
      ...baseQueryKeyParts,
      page,
      pageSize,
      domainsSort.field,
      domainsSort.order,
      domainsFilters,
    ],
    enabled: targetReady && tab === "domains",
    gcTime: BACKLINKS_QUERY_STALE_TIME_MS,
    queryFn: () =>
      getBacklinksReferringDomains({
        data: {
          ...pageInputBase,
          sortField: domainsSort.field,
          sortOrder: domainsSort.order,
          filters: domainsFilters,
        },
      }),
  });

  const pagesSort = toSort(
    sort,
    order,
    topPagesSortFieldSchema.options,
    BACKLINKS_DEFAULT_SORT.pages,
  );
  const pagesFilters = useMemo(
    () => toTopPagesFiltersPayload(filters.pages.values),
    [filters.pages.values],
  );
  const topPagesQuery = useMeteredQuery({
    authorized,
    runNonce,
    queryKey: [
      "backlinksTopPages",
      ...baseQueryKeyParts,
      page,
      pageSize,
      pagesSort.field,
      pagesSort.order,
      pagesFilters,
    ],
    enabled: targetReady && tab === "pages",
    gcTime: BACKLINKS_QUERY_STALE_TIME_MS,
    queryFn: () =>
      getBacklinksTopPages({
        data: {
          ...pageInputBase,
          sortField: pagesSort.field,
          sortOrder: pagesSort.order,
          filters: pagesFilters,
        },
      }),
  });

  const anchorsSort = toSort(
    sort,
    order,
    anchorsSortFieldSchema.options,
    BACKLINKS_DEFAULT_SORT.anchors,
  );
  const anchorsFilters = useMemo(
    () => toAnchorsFiltersPayload(filters.anchors.values),
    [filters.anchors.values],
  );
  const anchorsQuery = useMeteredQuery({
    authorized,
    runNonce,
    queryKey: [
      "backlinksAnchors",
      ...baseQueryKeyParts,
      page,
      pageSize,
      anchorsSort.field,
      anchorsSort.order,
      anchorsFilters,
    ],
    enabled: targetReady && tab === "anchors",
    gcTime: BACKLINKS_QUERY_STALE_TIME_MS,
    queryFn: () =>
      getBacklinksAnchors({
        data: {
          ...pageInputBase,
          sortField: anchorsSort.field,
          sortOrder: anchorsSort.order,
          filters: anchorsFilters,
        },
      }),
  });

  const overviewErrorMessage = getBacklinksErrorMessage(
    overviewQuery.error,
    "Could not load backlinks data.",
  );
  const activeTabQuery =
    tab === "backlinks"
      ? rowsQuery
      : tab === "domains"
        ? referringDomainsQuery
        : tab === "anchors"
          ? anchorsQuery
          : topPagesQuery;
  const activeTabErrorMessage = getBacklinksErrorMessage(
    activeTabQuery.error,
    "Could not load this tab.",
  );

  return {
    activeTabErrorMessage,
    activeTabQuery,
    anchorsQuery,
    overviewErrorMessage,
    overviewQuery,
    referringDomainsQuery,
    rowsQuery,
    searchCardInitialValues,
    topPagesQuery,
  };
}

export function navigateToBacklinksSearch(
  navigate: BacklinksPageProps["navigate"],
  values: Pick<BacklinksSearchState, "target" | "scope">,
) {
  navigate({
    search: (prev) => ({
      ...prev,
      target: values.target,
      scope: getPersistedBacklinksSearchScope(values.target, values.scope),
      tab: undefined,
      page: undefined,
      sort: undefined,
      order: undefined,
    }),
    replace: true,
  });
}
