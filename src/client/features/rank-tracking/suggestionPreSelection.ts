import type { FitResult } from "@/shared/keyword-fit/keywordFit";

/** Only the two fields the pre-selection actually decides on. Not exported:
 *  callers pass their own richer row and structural typing does the rest. */
type PreSelectableSuggestion = {
  keyword: string;
  traffic: number | null;
};

type SuggestionPreSelection = {
  /** Keyed by ROW INDEX, matching TanStack Table's default `getRowId`. */
  selection: Record<string, boolean>;
  /** Rows the profile ruled out, left for the user to tick deliberately. */
  wrongFitCount: number;
};

/**
 * The rows to tick on behalf of the user when suggestions land.
 *
 * Traffic alone used to decide this, and the result is billed on a RECURRING
 * schedule: a plumber who happens to rank for "plumber salary" got it
 * pre-ticked and re-checked every week forever. Fit is therefore a hard
 * filter here rather than a sort key -- unlike the research table, where a
 * wrong-customer keyword is only demoted, because there nothing is spent by
 * leaving it on screen.
 *
 * Wrong-fit rows stay selectable; only the unattended default changes. An
 * empty `fit` map (no usable profile -- see `useKeywordFit`) means nothing is
 * ruled out and this is exactly the old top-by-traffic behaviour.
 */
export function pickPreSelectedSuggestions(
  items: readonly PreSelectableSuggestion[],
  fit: ReadonlyMap<string, FitResult>,
  limit: number,
): SuggestionPreSelection {
  const eligible: Array<{ index: number; traffic: number }> = [];
  let wrongFitCount = 0;

  for (const [index, item] of items.entries()) {
    if (fit.get(item.keyword)?.verdict === "wrong-customer") {
      wrongFitCount += 1;
      continue;
    }
    eligible.push({ index, traffic: item.traffic ?? 0 });
  }

  // Ties break to the earlier row, which is the order the provider ranked
  // them in -- so an all-zero-traffic set still pre-selects the provider's
  // own top rows rather than an arbitrary permutation.
  const ranked = eligible.toSorted((a, b) => b.traffic - a.traffic);
  const selection: Record<string, boolean> = {};
  for (const row of ranked.slice(0, Math.max(0, limit))) {
    selection[String(row.index)] = true;
  }

  return { selection, wrongFitCount };
}
