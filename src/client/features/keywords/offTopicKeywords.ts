import { isOffTopic, tokenizeSeed } from "@/shared/keywordRelevance";

/**
 * Splits research rows into ones that share a word with the seed and ones that
 * don't. Off-topic rows are collapsed in the table rather than dropped on the
 * server, so the call stays visible and reversible by the person reading it.
 */
export function partitionByRelevance<T extends { keyword: string }>(
  rows: T[],
  seedKeyword: string,
): { onTopic: T[]; offTopic: T[] } {
  const seedTokens = tokenizeSeed(seedKeyword);
  if (seedTokens.length === 0) return { onTopic: rows, offTopic: [] };

  const onTopic: T[] = [];
  const offTopic: T[] = [];
  for (const row of rows) {
    if (isOffTopic(row.keyword, seedTokens)) offTopic.push(row);
    else onTopic.push(row);
  }
  return { onTopic, offTopic };
}
