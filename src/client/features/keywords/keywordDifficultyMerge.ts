import type { KeywordResearchRow } from "@/types/keywords";
import type { KeywordDifficultyOverviewRow } from "@/types/schemas/keywords";

/**
 * Shape of `useKeywordDifficultyOverview`'s own `byKeyword` return value
 * (that hook's internal alias is deliberately not exported -- knip flags an
 * unused export -- so this is the same structural shape spelled out again;
 * TypeScript's structural typing makes the two interchangeable). Keyed by
 * lowercased keyword, matching that hook's own `byKeyword` construction.
 */
export type DifficultyOverviewByKeyword = ReadonlyMap<
  string,
  KeywordDifficultyOverviewRow
>;

/**
 * Overlays one row with its on-demand-loaded difficulty/intent, if any was
 * fetched for it. Never mutates -- returns the SAME row reference when
 * nothing was loaded for this keyword, so callers can cheaply tell "nothing
 * changed" via `===`.
 *
 * Prefers the loaded value only when it is itself non-null: Labs can
 * legitimately answer "no difficulty data for this keyword" (a real null),
 * and that must not be allowed to erase a difficulty the main run's own
 * response already had (which, per `canBackfillDifficulty`'s own gate, only
 * happens for a keyword that was never actually missing in the first place --
 * but this function stays defensive regardless of caller behaviour).
 */
export function mergeDifficultyOverview(
  row: KeywordResearchRow,
  byKeyword: DifficultyOverviewByKeyword,
): KeywordResearchRow {
  const loaded = byKeyword.get(row.keyword.toLowerCase());
  if (!loaded) return row;
  return {
    ...row,
    keywordDifficulty: loaded.keywordDifficulty ?? row.keywordDifficulty,
    intent: loaded.intent ?? row.intent,
  };
}

/**
 * Which of this page's keywords the "Load difficulty for these N" button
 * should actually request, capped to `max` (the server's own
 * `KEYWORD_DIFFICULTY_OVERVIEW_MAX_KEYWORDS`).
 *
 * Excludes a row once `byKeyword` already HAS an entry for it -- not once its
 * difficulty is non-null. SERP Overview never needed this distinction (it
 * only ever backfills one keyword at a time), but a Keyword Research page can
 * hold up to 500 rows, and Labs genuinely has no difficulty for some real
 * keywords (obscure long-tail terms, mostly). Gating on "difficulty is still
 * null" alone would make the button reappear forever for those specific
 * keywords, every time this component re-renders -- looking like a bug
 * (clicking never gets rid of it) rather than the honest "Labs has no answer
 * for these" outcome it actually is. Gating on "was this keyword ever asked"
 * instead means one attempt is enough, whatever Labs said.
 */
export function selectDifficultyBackfillKeywords(
  rows: readonly KeywordResearchRow[],
  byKeyword: DifficultyOverviewByKeyword,
  max: number,
): string[] {
  return rows
    .filter(
      (row) =>
        row.keywordDifficulty == null &&
        !byKeyword.has(row.keyword.toLowerCase()),
    )
    .slice(0, max)
    .map((row) => row.keyword);
}
