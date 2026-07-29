import { isOffTopic, tokenizeSeed } from "@/shared/keywordRelevance";
import type { EnrichedKeyword } from "./helpers";

export type KeywordSource = "related" | "suggestions" | "ideas";
export type KeywordMode = "auto" | KeywordSource;
/**
 * Where research rows actually came from. "google_ads" is not requestable as
 * a mode; it's the automatic source for countries Labs doesn't support.
 */
export type ResearchSource = KeywordSource | "google_ads";

/**
 * Order matters. `keyword_suggestions` returns keywords *containing* the seed
 * phrase, so it cannot change the subject; `ideas` stays close; `related` walks
 * Google's related-searches graph and is the only one that can drift, so it
 * runs last and only when the first two came up short.
 */
export const AUTO_KEYWORD_SOURCES: KeywordSource[] = [
  "suggestions",
  "ideas",
  "related",
];

/**
 * How many rows Auto needs before it stops trying further sources.
 *
 * Named for what it used to count. It is now the minimum number of *relevant*
 * non-seed rows — see {@link hasSufficientCoverage} — because counting rows
 * that merely differed from the seed is what let 46 keywords about the meaning
 * of names satisfy it.
 */
export const MIN_NON_SEED_FOR_AUTO = 5;

export function countNonSeedKeywords(
  rows: EnrichedKeyword[],
  seedKeyword: string,
): number {
  const normalizedSeed = seedKeyword.trim().toLowerCase();
  return rows.filter((row) => row.keyword !== normalizedSeed).length;
}

/**
 * Non-seed rows that still share a word with the seed. This is the number Auto
 * decides on: a source can return a full page of rows that are all about
 * something else, and that must not read as coverage.
 */
export function countRelevantKeywords(
  rows: EnrichedKeyword[],
  seedKeyword: string,
): number {
  const normalizedSeed = seedKeyword.trim().toLowerCase();
  const seedTokens = tokenizeSeed(seedKeyword);
  if (seedTokens.length === 0) return countNonSeedKeywords(rows, seedKeyword);

  return rows.filter(
    (row) =>
      row.keyword !== normalizedSeed && !isOffTopic(row.keyword, seedTokens),
  ).length;
}

export function hasSufficientCoverage(
  rows: EnrichedKeyword[],
  seedKeyword: string,
  threshold: number = MIN_NON_SEED_FOR_AUTO,
): boolean {
  return countRelevantKeywords(rows, seedKeyword) >= threshold;
}

/**
 * Trims the accumulated rows to the requested limit, relevant ones first.
 *
 * Auto has to keep accumulating across sources without letting an early source
 * spend the whole budget: a first source that returns a full page of drifted
 * rows would otherwise leave no room for the relevant rows a later source
 * returns, and coverage could never recover. Capping only here — at the end,
 * relevant-first — means a later source's on-topic rows displace an earlier
 * source's off-topic ones instead of being dropped for lack of space.
 *
 * Order within each group is preserved, so a source's own ranking survives.
 */
export function selectResearchRows(
  rows: EnrichedKeyword[],
  seedKeyword: string,
  limit: number,
): EnrichedKeyword[] {
  if (rows.length <= limit) return rows;

  const seedTokens = tokenizeSeed(seedKeyword);
  if (seedTokens.length === 0) return rows.slice(0, limit);

  const relevant: EnrichedKeyword[] = [];
  const offTopic: EnrichedKeyword[] = [];
  for (const row of rows) {
    if (isOffTopic(row.keyword, seedTokens)) offTopic.push(row);
    else relevant.push(row);
  }

  // Off-topic rows still fill any remaining space rather than being deleted —
  // the client collapses them behind a toggle, so nothing vanishes silently.
  return [...relevant, ...offTopic].slice(0, limit);
}
