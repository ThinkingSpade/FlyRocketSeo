import { useForm, useStore } from "@tanstack/react-form";
import { useCallback } from "react";
import {
  countActiveSavedKeywordsFilters,
  EMPTY_SAVED_KEYWORDS_FILTERS,
  type SavedKeywordsFilterValues,
} from "./savedKeywordsFilterTypes";

const FILTER_KEYS: Array<keyof SavedKeywordsFilterValues> = [
  "include",
  "exclude",
  "minVol",
  "maxVol",
  "minCpc",
  "maxCpc",
  "minKd",
  "maxKd",
];

/**
 * `initialInclude` seeds the Include field from the route's `?q=`, so a link
 * that already knows the term lands on the narrowed list instead of the whole
 * saved set. Read once, as a form default -- typing over it is the user
 * correcting the handoff, and re-applying the URL would fight them.
 */
export function useSavedKeywordsFilters(initialInclude?: string) {
  const filtersForm = useForm({
    defaultValues: {
      ...EMPTY_SAVED_KEYWORDS_FILTERS,
      include: initialInclude?.trim() ?? "",
    },
  });
  const values = useStore(filtersForm.store, (s) => s.values);
  const activeFilterCount = countActiveSavedKeywordsFilters(values);

  const resetFilters = useCallback(() => {
    for (const key of FILTER_KEYS) {
      filtersForm.setFieldValue(key, "");
    }
  }, [filtersForm]);

  return { filtersForm, values, activeFilterCount, resetFilters };
}

export type SavedKeywordsFilterForm = ReturnType<
  typeof useSavedKeywordsFilters
>["filtersForm"];
