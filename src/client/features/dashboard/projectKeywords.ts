// Pure selectors for the dashboard's "Your keywords" card (no I/O), split
// out so the bucketing rules are unit-testable.

export type RankedQuery = {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
};

type ProjectKeywordSummary = {
  /** Queries the site surfaced for at all in the period. */
  ranking: number;
  top3: number;
  top10: number;
  /** Positions 4–20: visible, not yet winning — the target list. */
  closeToPageOne: number;
};

/** Positions 4–20 are "one push from real traffic"; past 20 the gap is a
 *  content project, not an optimization. */
const OPPORTUNITY_MIN_POSITION = 4;
const OPPORTUNITY_MAX_POSITION = 20;

export function summarizeProjectKeywords(
  queries: RankedQuery[],
): ProjectKeywordSummary {
  let top3 = 0;
  let top10 = 0;
  let closeToPageOne = 0;
  for (const item of queries) {
    if (item.position <= 3) top3 += 1;
    if (item.position <= 10) top10 += 1;
    if (
      item.position >= OPPORTUNITY_MIN_POSITION &&
      item.position <= OPPORTUNITY_MAX_POSITION
    ) {
      closeToPageOne += 1;
    }
  }
  return { ranking: queries.length, top3, top10, closeToPageOne };
}

/** What's already working: best earners first, then widest reach. */
export function selectRankingNow(
  queries: RankedQuery[],
  limit = 6,
): RankedQuery[] {
  return queries
    .filter((item) => item.clicks > 0 || item.position <= 10)
    .toSorted((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

/**
 * What to target next: real demand (impressions) where the site already
 * appears at positions 4–20. Sorted by impressions because that is the
 * traffic actually on the table.
 */
export function selectOpportunities(
  queries: RankedQuery[],
  limit = 6,
): RankedQuery[] {
  return queries
    .filter(
      (item) =>
        item.position >= OPPORTUNITY_MIN_POSITION &&
        item.position <= OPPORTUNITY_MAX_POSITION,
    )
    .toSorted(
      (a, b) => b.impressions - a.impressions || a.position - b.position,
    )
    .slice(0, limit);
}
