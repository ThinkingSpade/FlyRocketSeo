import { useCallback, useEffect, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import {
  EMPTY_QUERIES_FILTERS,
  EMPTY_TOP_PAGES_FILTERS,
  type QueriesFilterValues,
  type TopPagesFilterValues,
} from "./brandLookupFilterTypes";
import { countActiveFilters } from "./brandLookupFiltering";

// v3: the pages tab returned to provider page-level metrics after a brief
// sampled-prompt scale. Bump the prefix so local min/max filters do not carry
// between incompatible metric scales.
const STORAGE_KEY_PREFIX = "brand-lookup-filters-v3:";

// Namespaced per project: these filters hold project-specific text (prompt and
// URL substrings), so a global key let one client's filter hide another
// client's rows. The route remount cannot fix that — `localStorage` outlives
// the component.
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

function useTabFilters<T extends FilterValues>(
  projectId: string,
  tab: string,
  emptyValues: T,
) {
  const [defaultValues] = useState<T>(() =>
    loadFromStorage(projectId, tab, { ...emptyValues }),
  );
  const form = useForm({ defaultValues });
  const values = useStore(form.store, (state) => state.values);

  useEffect(() => {
    saveToStorage(projectId, tab, values);
  }, [projectId, tab, values]);

  const reset = useCallback(() => {
    form.reset({ ...emptyValues }, { keepDefaultValues: true });
  }, [emptyValues, form]);

  return {
    form,
    values,
    reset,
    activeFilterCount: countActiveFilters(values),
  };
}

export function useBrandLookupFilters(projectId: string) {
  const [showFilters, setShowFilters] = useState(false);

  const pages = useTabFilters<TopPagesFilterValues>(
    projectId,
    "pages",
    EMPTY_TOP_PAGES_FILTERS,
  );
  const queries = useTabFilters<QueriesFilterValues>(
    projectId,
    "queries",
    EMPTY_QUERIES_FILTERS,
  );

  return {
    pages,
    queries,
    showFilters,
    setShowFilters,
  };
}

export type BrandLookupFiltersState = ReturnType<typeof useBrandLookupFilters>;
