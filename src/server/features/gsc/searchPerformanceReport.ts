import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

/**
 * Pure shaping helpers for the Search Performance page. Kept separate from the
 * server function so the aggregation and striking-distance rules are unit
 * testable without a GSC client.
 */

type SearchPerformanceTotals = {
  clicks: number;
  impressions: number;
  /** 0..1 (clicks / impressions). */
  ctr: number;
  /** Impression-weighted average position; 0 when there were no impressions. */
  position: number;
};

type SearchPerformanceDimensionRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type StrikingDistanceRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

// "Striking distance" = already ranking, not yet in the top spots: the queries
// where a content improvement most plausibly moves real traffic.
const STRIKING_DISTANCE_MIN_POSITION = 5;
const STRIKING_DISTANCE_MAX_POSITION = 20;
const STRIKING_DISTANCE_ROW_LIMIT = 100;

export function sumSearchTotals(
  rows: GscSearchAnalyticsRow[],
): SearchPerformanceTotals {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weightedPosition += row.position * row.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  };
}

type QueryTotalsRow = {
  query: string;
  clicks: number;
  impressions: number;
};

const QUERY_TOTALS_ROW_LIMIT = 500;

/**
 * Aggregate query×page rows into per-query totals (top rows by clicks, then
 * impressions) — the input for the client-side branded/non-branded split.
 */
export function buildQueryTotals(
  rows: GscSearchAnalyticsRow[],
): QueryTotalsRow[] {
  const byQuery = new Map<string, { clicks: number; impressions: number }>();
  for (const row of rows) {
    const query = row.keys?.[0];
    if (!query) continue;
    const entry = byQuery.get(query) ?? { clicks: 0, impressions: 0 };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    byQuery.set(query, entry);
  }
  return [...byQuery.entries()]
    .map(([query, totals]) => ({ query, ...totals }))
    .toSorted((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, QUERY_TOTALS_ROW_LIMIT);
}

/** Flatten single-dimension rows (query or page) into a keyed table row. */
export function toDimensionRows(
  rows: GscSearchAnalyticsRow[],
): SearchPerformanceDimensionRow[] {
  const output: SearchPerformanceDimensionRow[] = [];
  for (const row of rows) {
    const key = row.keys?.[0];
    if (!key) continue;
    output.push({
      key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    });
  }
  return output;
}

/** Reduce `["query","page"]` rows to one striking-distance row per query.
 *
 *  GSC returns a row per page that ranks for a query, so a query fans out across
 *  every page it appears on. A query only belongs in "striking distance" when
 *  the site's BEST-ranking page for it sits in the 5..20 band — if any page
 *  already ranks above position 5, the site effectively ranks near the top and
 *  improving a secondary page won't move traffic. So we collapse each query to
 *  its top page (lowest average position; ties broken by impressions) and keep
 *  it only when that top page is in band. Result is sorted by impressions. */
export function buildStrikingDistanceRows(
  rows: GscSearchAnalyticsRow[],
  limit: number = STRIKING_DISTANCE_ROW_LIMIT,
): StrikingDistanceRow[] {
  const topPageByQuery = new Map<string, StrikingDistanceRow>();
  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;

    const current = topPageByQuery.get(query);
    const isBetter =
      !current ||
      row.position < current.position ||
      (row.position === current.position &&
        row.impressions > current.impressions);
    if (!isBetter) continue;

    topPageByQuery.set(query, {
      query,
      page,
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    });
  }

  return Array.from(topPageByQuery.values())
    .filter(
      (row) =>
        row.position >= STRIKING_DISTANCE_MIN_POSITION &&
        row.position <= STRIKING_DISTANCE_MAX_POSITION,
    )
    .toSorted((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

/** The same-length period immediately before [startDate, endDate], for the
 *  totals comparison. Dates are YYYY-MM-DD in UTC. */
export function previousPeriod(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const lengthMs = Math.max(end - start, 0);
  const prevEnd = start - dayMs;
  const prevStart = prevEnd - lengthMs;
  return {
    startDate: formatUtcDate(prevStart),
    endDate: formatUtcDate(prevEnd),
  };
}

function formatUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

type CtrOpportunityRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** Estimated clicks left on the table each period at a healthy CTR. */
  missedClicks: number;
};

// Rough organic CTR benchmarks by position — generous on the low side so only
// clearly underperforming rows surface.
function expectedCtr(position: number): number {
  if (position <= 1) return 0.25;
  if (position <= 2) return 0.15;
  if (position <= 3) return 0.1;
  if (position <= 5) return 0.06;
  if (position <= 10) return 0.03;
  return 0.015;
}

const CTR_OPPORTUNITY_MIN_IMPRESSIONS = 50;
const CTR_OPPORTUNITY_MAX_POSITION = 12;
const CTR_OPPORTUNITY_ROW_LIMIT = 10;

/** Queries that rank well but get clicked far below the benchmark for their
 *  position — the classic "rewrite the title/meta" list. */
export function buildCtrOpportunityRows(
  rows: GscSearchAnalyticsRow[],
): CtrOpportunityRow[] {
  const output: CtrOpportunityRow[] = [];
  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;
    if (row.impressions < CTR_OPPORTUNITY_MIN_IMPRESSIONS) continue;
    if (row.position > CTR_OPPORTUNITY_MAX_POSITION) continue;
    const benchmark = expectedCtr(row.position);
    if (row.ctr >= benchmark * 0.5) continue;
    output.push({
      query,
      page,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      missedClicks: Math.round(row.impressions * (benchmark - row.ctr)),
    });
  }
  return output
    .toSorted((a, b) => b.missedClicks - a.missedClicks)
    .slice(0, CTR_OPPORTUNITY_ROW_LIMIT);
}
