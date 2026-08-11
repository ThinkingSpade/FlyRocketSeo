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
 * `searchVolume: 0` counts. The mapper preserves a measured zero separately
 * from a missing value (`research-data.ts` maps `?? null`), and "Google
 * measured this and found no demand" is a real, actionable answer — quite
 * different from "Google has nothing for this". An earlier version of this
 * function treated 0 as absent, which would have hidden a genuine
 * zero-demand verdict behind a "no data" screen and invited the user to pay
 * for the same search again.
 *
 * `intent` counts too: DataForSEO Labs populates search intent independently
 * of the numeric fields (`research-data.ts` reads `search_intent_info`), so a
 * row can legitimately arrive carrying intent and nothing else.
 */
export function hasUsableMetrics(row: KeywordResearchRow): boolean {
  return (
    row.searchVolume != null ||
    row.cpc != null ||
    row.competition != null ||
    row.keywordDifficulty != null ||
    (row.intent !== "unknown" && row.intent != null) ||
    hasTrendSignal(row)
  );
}

/** Rows that are something other than the seed the user typed. */
function hasKeywordIdeas(
  rows: readonly KeywordResearchRow[],
  seedKeyword: string,
): boolean {
  const seed = seedKeyword.trim().toLowerCase();
  return rows.some((row) => row.keyword.trim().toLowerCase() !== seed);
}

/** Not exported: the one caller reads it off `resolveKeywordResultUsability`'s
 *  return value rather than importing the type, which is what keeps knip from
 *  flagging it — the same convention keywordProviderNotice.ts follows. */
type KeywordResultUsability =
  | { kind: "usable" }
  /** The vendor returned nothing but the seed, carrying no figures. */
  | { kind: "no-metrics"; rowCount: number };

/**
 * `no-metrics` is deliberately narrow: EVERY row must lack any usable figure
 * AND no row may be a keyword other than the seed.
 *
 * The second condition is the important one. A run can legitimately return a
 * page of keyword IDEAS with no volume attached — and that list is itself the
 * thing the user paid for. Suppressing the whole table in that case would
 * conceal a purchased result set and take the export, save and rank-tracking
 * actions with it, which is far worse than the dash-table this state exists to
 * replace. So this only fires for the actual failure it was built for: the
 * vendor handing back the user's own seed and nothing else.
 */
export function resolveKeywordResultUsability(
  rows: readonly KeywordResearchRow[],
  seedKeyword: string,
): KeywordResultUsability {
  // An empty array is NOT this function's problem. The tab already has a
  // dedicated "no results" state for it (KeywordResearchEmptyState's own
  // NoResultsState), and reporting `no-metrics` here would put two competing
  // empty states on screen for the same run.
  if (rows.length === 0) return { kind: "usable" };
  if (rows.some(hasUsableMetrics)) return { kind: "usable" };
  if (hasKeywordIdeas(rows, seedKeyword)) return { kind: "usable" };
  return { kind: "no-metrics", rowCount: rows.length };
}
