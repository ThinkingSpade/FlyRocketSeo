import type { KeywordResearchRow } from "@/types/keywords";

// Pure term-grouping for the Keyword Magic-style groups rail (no I/O),
// split out so the tokenization rules are unit-testable.

export type KeywordGroup = {
  term: string;
  /** How many result keywords contain the term. */
  keywordCount: number;
  /** Summed search volume of those keywords (nulls count as 0). */
  totalVolume: number;
};

export type KeywordGroupSort = "count" | "volume";

// Only glue words are dropped. Deliberately short: modifiers like "near",
// "best", or "24" are real slices worth surfacing (Semrush keeps them too).
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "to",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "by",
  "vs",
]);

function tokenize(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

/**
 * Aggregate the loaded result rows into clickable term groups: every token
 * that is not part of the seed query and not a stopword, with the count and
 * summed volume of the keywords containing it. Terms matching a single
 * keyword are noise and dropped.
 */
export function extractKeywordGroups(
  rows: KeywordResearchRow[],
  seedKeyword: string,
): KeywordGroup[] {
  const seedTerms = new Set(tokenize(seedKeyword));
  const groups = new Map<
    string,
    { keywordCount: number; totalVolume: number }
  >();

  for (const row of rows) {
    const seen = new Set<string>();
    for (const term of tokenize(row.keyword)) {
      if (seen.has(term) || seedTerms.has(term) || STOPWORDS.has(term)) {
        continue;
      }
      seen.add(term);
      const group = groups.get(term) ?? { keywordCount: 0, totalVolume: 0 };
      group.keywordCount += 1;
      group.totalVolume += row.searchVolume ?? 0;
      groups.set(term, group);
    }
  }

  return [...groups.entries()]
    .map(([term, stats]) => ({ term, ...stats }))
    .filter((group) => group.keywordCount > 1);
}

/** Token-level match, so a group's filter yields exactly its counted rows. */
export function keywordHasTerm(keyword: string, term: string): boolean {
  return tokenize(keyword).includes(term);
}

export function sortKeywordGroups(
  groups: KeywordGroup[],
  sort: KeywordGroupSort,
): KeywordGroup[] {
  return groups.toSorted((a, b) =>
    sort === "volume"
      ? b.totalVolume - a.totalVolume || b.keywordCount - a.keywordCount
      : b.keywordCount - a.keywordCount || b.totalVolume - a.totalVolume,
  );
}

type KeywordTotals = {
  keywordCount: number;
  totalVolume: number;
  /** Average keyword difficulty across rows that have one, or null. */
  averageDifficulty: number | null;
};

/** Semrush-style totals strip: keyword count, summed volume, average KD. */
export function computeKeywordTotals(
  rows: KeywordResearchRow[],
): KeywordTotals {
  let totalVolume = 0;
  let difficultySum = 0;
  let difficultyCount = 0;
  for (const row of rows) {
    totalVolume += row.searchVolume ?? 0;
    if (row.keywordDifficulty != null) {
      difficultySum += row.keywordDifficulty;
      difficultyCount += 1;
    }
  }
  return {
    keywordCount: rows.length,
    totalVolume,
    averageDifficulty:
      difficultyCount > 0 ? Math.round(difficultySum / difficultyCount) : null,
  };
}
