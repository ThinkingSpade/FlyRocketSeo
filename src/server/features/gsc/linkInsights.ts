import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

/**
 * Pure shaping for the Link Opportunities and Cannibalization pages, both
 * derived from one `["query","page"]` Search Analytics fetch. Kept free of I/O
 * so the ranking rules are unit-testable without a GSC client.
 */

type LinkOpportunitySource = {
  page: string;
  position: number;
  impressions: number;
};

type LinkOpportunity = {
  query: string;
  target: {
    page: string;
    position: number;
    impressions: number;
    clicks: number;
  };
  sources: LinkOpportunitySource[];
};

type CannibalizationPage = {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
  isWinner: boolean;
};

type CannibalizationRow = {
  query: string;
  totalClicks: number;
  totalImpressions: number;
  pages: CannibalizationPage[];
};

// Striking-distance band: already ranking, close enough that on-page changes
// (like internal links) plausibly move real traffic.
const TARGET_MIN_POSITION = 4;
const TARGET_MAX_POSITION = 20;
const MAX_OPPORTUNITIES = 15;
const MAX_SOURCES_PER_QUERY = 5;
/** Impression share above which one page is treated as owning a query. Matches
 *  the threshold in gscAggregation so "owns this query" means the same thing
 *  wherever it is decided. */
const PAGE_OWNERSHIP_THRESHOLD = 0.6;

// A page only "competes" for a query when it has a meaningful share of the
// query's impressions — tiny one-off impressions are noise, not cannibalization.
const CANNIBAL_MIN_IMPRESSIONS = 5;
const CANNIBAL_MIN_SHARE = 0.1;
const MAX_CANNIBALIZATION_ROWS = 50;

type QueryPageRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

function toQueryPageRows(rows: GscSearchAnalyticsRow[]): QueryPageRow[] {
  const output: QueryPageRow[] = [];
  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;
    output.push({
      query,
      page,
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    });
  }
  return output;
}

function groupByQuery(rows: QueryPageRow[]): Map<string, QueryPageRow[]> {
  const byQuery = new Map<string, QueryPageRow[]>();
  for (const row of rows) {
    const list = byQuery.get(row.query);
    if (list) list.push(row);
    else byQuery.set(row.query, [row]);
  }
  return byQuery;
}

/**
 * Internal-link opportunities: for each query whose leading page sits in the
 * striking-distance band, every OTHER page Google already associates with the
 * query is a candidate to add an internal link (anchor = the query) pointing at
 * that page. Google's own query→page association beats naive text matching for
 * relevance.
 *
 * The link target is the page that CARRIES the query's impressions, not the one
 * with the lowest average position. Sorting by position picked link targets off
 * a single-impression fluke: a page averaging 1.0 from one impression outranked
 * the page averaging 8.0 from a thousand, so we would have pointed internal
 * links at a URL nobody reaches. GSC averages position over impressions per row,
 * so a minimum across separately averaged rows is not a rank at all.
 */
export function buildLinkOpportunities(
  rows: GscSearchAnalyticsRow[],
): LinkOpportunity[] {
  const byQuery = groupByQuery(toQueryPageRows(rows));

  const opportunities: LinkOpportunity[] = [];
  for (const [query, pages] of byQuery) {
    const totalImpressions = pages.reduce(
      (sum, page) => sum + page.impressions,
      0,
    );
    const best = pages.toSorted(
      (a, b) => b.impressions - a.impressions || a.position - b.position,
    )[0];
    if (
      best.position < TARGET_MIN_POSITION ||
      best.position > TARGET_MAX_POSITION
    ) {
      continue;
    }
    // Where no page owns the query, the "target" is arbitrary and adding links
    // toward it may be the wrong action -- consolidation could be. Skip rather
    // than recommend confidently on a coin flip.
    if (
      totalImpressions > 0 &&
      best.impressions / totalImpressions < PAGE_OWNERSHIP_THRESHOLD &&
      pages.length > 1
    ) {
      continue;
    }

    const sources = pages
      .filter((page) => page.page !== best.page)
      .toSorted((a, b) => b.impressions - a.impressions)
      .slice(0, MAX_SOURCES_PER_QUERY)
      .map(({ page, position, impressions }) => ({
        page,
        position,
        impressions,
      }));
    if (sources.length === 0) continue;

    opportunities.push({
      query,
      target: {
        page: best.page,
        position: best.position,
        impressions: best.impressions,
        clicks: best.clicks,
      },
      sources,
    });
  }

  return opportunities
    .toSorted((a, b) => b.target.impressions - a.target.impressions)
    .slice(0, MAX_OPPORTUNITIES);
}

/**
 * Cannibalization: queries where two or more pages each hold a meaningful
 * share of impressions. The winner (best position, ties by clicks) is the page
 * the others should consolidate toward.
 */
export function buildCannibalizationRows(
  rows: GscSearchAnalyticsRow[],
): CannibalizationRow[] {
  const byQuery = groupByQuery(toQueryPageRows(rows));

  const output: CannibalizationRow[] = [];
  for (const [query, pages] of byQuery) {
    const totalImpressions = pages.reduce(
      (sum, page) => sum + page.impressions,
      0,
    );
    const competing = pages.filter(
      (page) =>
        page.impressions >= CANNIBAL_MIN_IMPRESSIONS &&
        page.impressions >= totalImpressions * CANNIBAL_MIN_SHARE,
    );
    if (competing.length < 2) continue;

    const winner = competing.toSorted(
      (a, b) => a.position - b.position || b.clicks - a.clicks,
    )[0];

    output.push({
      query,
      totalClicks: pages.reduce((sum, page) => sum + page.clicks, 0),
      totalImpressions,
      pages: competing
        .toSorted((a, b) => a.position - b.position)
        .map((page) => ({
          page: page.page,
          clicks: page.clicks,
          impressions: page.impressions,
          position: page.position,
          isWinner: page === winner,
        })),
    });
  }

  return output
    .toSorted((a, b) => b.totalImpressions - a.totalImpressions)
    .slice(0, MAX_CANNIBALIZATION_ROWS);
}
