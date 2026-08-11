import type { KeywordResearchRow } from "@/types/keywords";

/**
 * Whether a finished research run actually told the user anything.
 *
 * The gap this closes: the tab only ever had two states, "rows" and "no rows",
 * and treated any non-empty array as a result worth tabulating. A real run
 * against a US state returned exactly one row — the seed keyword, echoed back
 * by Google Ads with `search_volume`, `cpc` and `competition` all null — and
 * the tab rendered it as a table of dashes with a "Showing 1 keywords · 0
 * total vol" header. Nothing on screen said the vendor had no data; it read as
 * a broken page.
 *
 * That happens whenever a sub-country scope routes the run to Google Ads
 * (see resolveGeo.ts): Keyword Planner carries no figures for most long-tail
 * phrases at state/metro granularity, and `mapAdsKeywordItems` can never
 * populate difficulty or intent at all. A row can therefore arrive carrying
 * nothing but its own text, which is not a result — it is an absence, and the
 * UI has to be able to say so.
 *
 * Deliberately a pure module rather than a hook or an inline check: this
 * repo's Vitest collects `src/**\/*.test.ts` under `environment: "node"`, so
 * logic worth pinning has to live outside the `.tsx` that renders it.
 */

/** A trend array of all-zero months is what an absent trend deserialises to,
 *  so "has a trend" has to mean "has a month that actually moved". */
function hasTrendSignal(row: KeywordResearchRow): boolean {
  return row.trend.some((month) => (month.searchVolume ?? 0) > 0);
}

/**
 * A row carries at least one figure a user could act on.
 *
 * `searchVolume: 0` counts as absent rather than informative. Google Ads
 * reports a genuine "no measurable volume" and a missing value the same way
 * once it reaches this type, and a table of zeroes is exactly as useless as a
 * table of dashes — treating 0 as a real datum is what would keep the broken
 * state on screen.
 */
export function hasUsableMetrics(row: KeywordResearchRow): boolean {
  return (
    (row.searchVolume ?? 0) > 0 ||
    row.cpc != null ||
    row.competition != null ||
    row.keywordDifficulty != null ||
    hasTrendSignal(row)
  );
}

/** Not exported: the one caller reads it off `resolveKeywordResultUsability`'s
 *  return value rather than importing the type, which is what keeps knip from
 *  flagging it — the same convention keywordProviderNotice.ts follows. */
type KeywordResultUsability =
  | { kind: "usable" }
  /** Rows came back, but not one of them carries a single figure. */
  | { kind: "no-metrics"; rowCount: number };

export function resolveKeywordResultUsability(
  rows: readonly KeywordResearchRow[],
): KeywordResultUsability {
  // An empty array is NOT this function's problem. The tab already has a
  // dedicated "no results" state for it (KeywordResearchEmptyState's own
  // NoResultsState), and reporting `no-metrics` here would put two competing
  // empty states on screen for the same run.
  if (rows.length === 0) return { kind: "usable" };
  return rows.some(hasUsableMetrics)
    ? { kind: "usable" }
    : { kind: "no-metrics", rowCount: rows.length };
}
