import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

/**
 * The single owner of what a Search Console row means.
 *
 * The rule this module exists to enforce, from Google's own documentation:
 * **query-dimension rows are the only source of demand totals; query x page
 * rows are for attribution and distribution only.**
 *
 * Google counts a property once per impression however many of its URLs appear
 * in the result set, while page aggregation counts each displayed URL
 * separately. So a property showing two URLs for one query produces one
 * property impression and two page-row impressions. Summing page rows to get
 * "impressions for this query" therefore overcounts, and the overcount silently
 * propagates into branded splits, cannibalization severity and every
 * clicks-at-stake estimate downstream.
 *
 * No I/O here on purpose — this is pure arithmetic so it can be tested against
 * concrete payloads.
 */

type QueryTotalsRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type PageAttribution = {
  page: string;
  impressions: number;
  clicks: number;
  position: number;
  /**
   * Share of THIS QUERY'S page-row impressions.
   *
   * A distribution across the URLs that surfaced for the query — never a share
   * of property demand. Page rows overlap when several URLs of one property
   * appear for the same search, so these shares can describe which URL leads
   * without describing how much traffic the query brought.
   */
  shareOfQueryPageImpressions: number;
};

/** Rows returned by default, matching the cap the previous implementation used
 *  so consumers see the same list length. */
const QUERY_TOTALS_ROW_LIMIT = 500;

/**
 * Per-query demand totals.
 *
 * Input MUST be `dimensions: ["query"]` rows, requested with
 * `aggregationType: "byProperty"`. Passing query x page rows here reintroduces
 * the double count this module exists to prevent.
 *
 * Values are taken from each row rather than recomputed: `position` arrives
 * already averaged over that row's impressions and cannot be re-derived, and
 * `ctr` is the row's own clicks/impressions. Ordering and the row cap match the
 * previous page-summing implementation deliberately, so replacing it changes the
 * NUMBERS without also changing which queries appear or in what order.
 */
export function buildPropertyQueryTotals(
  rows: GscSearchAnalyticsRow[],
  limit: number = QUERY_TOTALS_ROW_LIMIT,
): QueryTotalsRow[] {
  const totals: QueryTotalsRow[] = [];

  for (const row of rows) {
    const query = row.keys?.[0];
    if (!query) continue;
    totals.push({
      query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    });
  }

  return totals
    .toSorted((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

/**
 * Distribution of each query across the URLs that surfaced for it.
 *
 * Input MUST be `dimensions: ["query","page"]` rows. Use the result to decide
 * WHICH page represents a query, never HOW MUCH demand the query has.
 */
export function attributePagesToQueries(
  rows: GscSearchAnalyticsRow[],
): Map<string, PageAttribution[]> {
  const byQuery = new Map<string, PageAttribution[]>();

  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;
    const pages = byQuery.get(query) ?? [];
    pages.push({
      page,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
      shareOfQueryPageImpressions: 0,
    });
    byQuery.set(query, pages);
  }

  for (const pages of byQuery.values()) {
    const total = pages.reduce((sum, page) => sum + page.impressions, 0);
    for (const page of pages) {
      page.shareOfQueryPageImpressions =
        total > 0 ? page.impressions / total : 0;
    }
    pages.sort((a, b) => b.impressions - a.impressions);
  }

  return byQuery;
}

/**
 * Share above which one URL is treated as owning the query.
 *
 * Matches the threshold trending opportunities already used for page dominance,
 * so "owns this query" means the same thing in both places.
 */
const PAGE_OWNERSHIP_THRESHOLD = 0.6;

/**
 * Pick the URL that actually represents a query.
 *
 * Explicitly NOT the minimum position. GSC averages position over impressions
 * per row, so the minimum across page rows lets a URL with one impression at
 * position 1.0 beat the URL carrying a thousand impressions at position 8.0.
 * Google defines no metric equal to `MIN(page average position)` — it is not
 * the property's average position, not the topmost position per impression, and
 * not a page's best observed rank.
 *
 * Ownership is therefore by impressions. Where no URL owns the query, that is
 * reported as a split rather than resolved by inventing a winner, because the
 * downstream actions differ: a query one page owns wants that page improved,
 * while a genuinely split query may want consolidation.
 */
export function representativePageForQuery(pages: PageAttribution[]): {
  page: string;
  position: number;
  split: boolean;
} {
  if (pages.length === 0) return { page: "", position: 0, split: false };

  const leader = pages.reduce((best, page) =>
    page.impressions > best.impressions ? page : best,
  );

  return {
    page: leader.page,
    position: leader.position,
    split:
      pages.length > 1 &&
      leader.shareOfQueryPageImpressions < PAGE_OWNERSHIP_THRESHOLD,
  };
}
