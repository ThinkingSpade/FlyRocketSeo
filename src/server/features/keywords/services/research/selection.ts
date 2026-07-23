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
 * Order matters. keyword_suggestions returns keywords containing the seed
 * phrase, so it cannot change the subject; ideas stays close; related walks
 * Google's related-searches graph and is the only one that can drift, so it
 * runs last and only when the first two came up short.
 */
export const AUTO_KEYWORD_SOURCES: KeywordSource[] = [
  "suggestions",
  "ideas",
  "related",
];

export const MIN_NON_SEED_FOR_AUTO = 5;

export function countNonSeedKeywords(
  rows: EnrichedKeyword[],
  seedKeyword: string,
): number {
  const normalizedSeed = seedKeyword.trim().toLowerCase();
  return rows.filter((row) => row.keyword !== normalizedSeed).length;
}

export function countRelevantKeywords(
  rows: EnrichedKeyword[],
  seedKeyword: string,
): number {
  const normalizedSeed = seedKeyword.trim().toLowerCase();
  const seedTokens = tokenizeSeed(seedKeyword);
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
