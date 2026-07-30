import { useCallback, useState } from "react";
import { MAX_DATAFORSEO_FILTER_CONDITIONS } from "@/types/schemas/domain";
import {
  EMPTY_ANCHORS_FILTERS,
  EMPTY_BACKLINKS_FILTERS,
  EMPTY_REFERRING_DOMAINS_FILTERS,
  EMPTY_TOP_PAGES_FILTERS,
  countActiveFilters,
  countFilterConditions,
  type AnchorsFilterValues,
  type BacklinksTabFilterValues,
  type ReferringDomainsFilterValues,
  type TopPagesFilterValues,
} from "./backlinksFilterTypes";

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
  tab: string,
  emptyValues: T,
) {
  const [values, setValues] = useState<T>(() =>
    loadFromStorage(projectId, tab, { ...emptyValues }),
  );

  const apply = useCallback(
    (next: T) => {
      setValues(next);
      saveToStorage(projectId, tab, next);
    },
    [projectId, tab],
  );

  const reset = useCallback(() => {
    apply({ ...emptyValues });
  }, [apply, emptyValues]);

  return {
    values,
    apply,
    reset,
    activeFilterCount: countActiveFilters(values),
  };
}

export function useBacklinksFilters(projectId: string) {
  const [showFilters, setShowFilters] = useState(false);

  const backlinks = useTabFilters<BacklinksTabFilterValues>(
    projectId,
    "backlinks",
    EMPTY_BACKLINKS_FILTERS,
  );
  const domains = useTabFilters<ReferringDomainsFilterValues>(
    projectId,
    "domains",
    EMPTY_REFERRING_DOMAINS_FILTERS,
  );
  const pages = useTabFilters<TopPagesFilterValues>(
    projectId,
    "pages",
    EMPTY_TOP_PAGES_FILTERS,
  );
  const anchors = useTabFilters<AnchorsFilterValues>(
    projectId,
    "anchors",
    EMPTY_ANCHORS_FILTERS,
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
