import { useCallback, useState } from "react";
import { MAX_DATAFORSEO_FILTER_CONDITIONS } from "@/types/schemas/domain";
import type { BacklinksTab } from "@/types/schemas/backlinks";
import {
  EMPTY_ANCHORS_FILTERS,
  EMPTY_BACKLINKS_FILTERS,
  EMPTY_REFERRING_DOMAINS_FILTERS,
  EMPTY_TOP_PAGES_FILTERS,
  countActiveFilters,
  countFilterConditions,
  toAnchorsFiltersPayload,
  toBacklinksFiltersPayload,
  toReferringDomainsFiltersPayload,
  toTopPagesFiltersPayload,
  type AnchorsFilterValues,
  type BacklinksTabFilterValues,
  type ReferringDomainsFilterValues,
  type TopPagesFilterValues,
} from "./backlinksFilterTypes";

/**
 * The server-shaped filter payload for whichever tab was just applied.
 *
 * Reported upward because these filters are part of the paid run's authorization
 * key, and that key has to be built from the values being applied -- not from
 * the hook's state, which is still one render behind inside the Apply handler.
 */
export type AppliedBacklinksFilters =
  | ReturnType<typeof toBacklinksFiltersPayload>
  | ReturnType<typeof toReferringDomainsFiltersPayload>
  | ReturnType<typeof toTopPagesFiltersPayload>
  | ReturnType<typeof toAnchorsFiltersPayload>;

export type BacklinksFiltersAppliedHandler = (
  tab: BacklinksTab,
  payload: AppliedBacklinksFilters,
) => void;

/**
 * Namespaced per project.
 *
 * These filters hold project-specific text (anchor and URL substrings, domain
 * names), so a global key let one client's filter silently hide another
 * client's rows. The route remount cannot help here — `localStorage` outlives
 * the component — so the project is part of the key.
 */
const STORAGE_KEY_PREFIX = "backlinks-filters:";

function storageKey(projectId: string, tab: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}:${tab}`;
}

type FilterValues = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function loadFromStorage<T extends FilterValues>(
  projectId: string,
  tab: string,
  fallback: T,
): T {
  const fallbackClone = { ...fallback };

  try {
    const raw = localStorage.getItem(storageKey(projectId, tab));
    if (!raw) return fallbackClone;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return fallbackClone;

    const result = { ...fallbackClone };
    for (const key in fallback) {
      const value = parsed[key];
      if (typeof value === "string") {
        Object.assign(result, { [key]: value });
      }
    }

    // Filters persisted before the server-side-filtering change had no
    // condition budget; values over the DataForSEO cap would fail every
    // query on load, so start fresh instead.
    if (countFilterConditions(result) > MAX_DATAFORSEO_FILTER_CONDITIONS) {
      return fallbackClone;
    }

    return result;
  } catch {
    return fallbackClone;
  }
}

function saveToStorage(projectId: string, tab: string, values: FilterValues) {
  try {
    localStorage.setItem(storageKey(projectId, tab), JSON.stringify(values));
  } catch {
    // storage full - silently ignore
  }
}

/**
 * Holds the *applied* filters for one tab. Draft edits live inside the filter
 * panel; values here are what the server queries use, persisted per tab.
 */
function useTabFilters<T extends FilterValues>(
  projectId: string,
  tab: BacklinksTab,
  emptyValues: T,
  toPayload: (values: T) => AppliedBacklinksFilters,
  onApplied?: BacklinksFiltersAppliedHandler,
) {
  const [values, setValues] = useState<T>(() =>
    loadFromStorage(projectId, tab, { ...emptyValues }),
  );

  const apply = useCallback(
    (next: T) => {
      setValues(next);
      saveToStorage(projectId, tab, next);
      // Reported with the payload rather than as a bare "something changed":
      // the caller needs the exact values to authorize the request they imply.
      onApplied?.(tab, toPayload(next));
    },
    [projectId, tab, toPayload, onApplied],
  );

  const reset = useCallback(() => {
    // Clearing filters is as much a new request as setting one, so it goes
    // through the same path rather than around it.
    apply({ ...emptyValues });
  }, [apply, emptyValues]);

  return {
    values,
    apply,
    reset,
    activeFilterCount: countActiveFilters(values),
  };
}

export function useBacklinksFilters(
  projectId: string,
  /** Called with the payload every time a tab's filters are applied or cleared.
   *  This is the hook's only outward signal that a new paid request is now
   *  wanted. Without it, applying a filter changed the authorization key and so
   *  silently DE-authorized the run, blanking the table the user had paid for. */
  onApplied?: BacklinksFiltersAppliedHandler,
) {
  const [showFilters, setShowFilters] = useState(false);

  const backlinks = useTabFilters<BacklinksTabFilterValues>(
    projectId,
    "backlinks",
    EMPTY_BACKLINKS_FILTERS,
    toBacklinksFiltersPayload,
    onApplied,
  );
  const domains = useTabFilters<ReferringDomainsFilterValues>(
    projectId,
    "domains",
    EMPTY_REFERRING_DOMAINS_FILTERS,
    toReferringDomainsFiltersPayload,
    onApplied,
  );
  const pages = useTabFilters<TopPagesFilterValues>(
    projectId,
    "pages",
    EMPTY_TOP_PAGES_FILTERS,
    toTopPagesFiltersPayload,
    onApplied,
  );
  const anchors = useTabFilters<AnchorsFilterValues>(
    projectId,
    "anchors",
    EMPTY_ANCHORS_FILTERS,
    toAnchorsFiltersPayload,
    onApplied,
  );

  return {
    backlinks,
    domains,
    pages,
    anchors,
    showFilters,
    setShowFilters,
  };
}

export type BacklinksFiltersState = ReturnType<typeof useBacklinksFilters>;
