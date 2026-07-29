import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  GscNotConnectedError,
  GscService,
} from "@/server/features/gsc/services/GscService";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import { previousPeriod } from "@/server/features/gsc/searchPerformanceReport";
import { SEARCH_PERFORMANCE_RANGES } from "@/types/schemas/search-performance";

/**
 * Per-query Search Console impressions for the current period AND the one
 * before it -- the input the Keyword Trends action list ranks from.
 *
 * A dedicated endpoint rather than another field on
 * `getSearchPerformanceReport`: that report is already four parallel GSC calls
 * loaded by several tabs, and its prior-period call is deliberately
 * `dimensions: ["date"]` for totals, so widening it would change a shape other
 * consumers depend on.
 *
 * Free and unmetered. Search Console has no per-call cost, which is why the
 * action list may load on mount while everything that costs money in this app
 * stays behind a click. Three parallel calls sit well inside Workers' six
 * simultaneous outgoing connections.
 *
 * BOTH period fetches use `dimensions: ["query"]`, and that symmetry is the
 * correctness condition for the whole feature. Google aggregates impressions
 * per dimension set: query-only counts one impression per property appearance,
 * query x page counts one per URL shown. Comparing a query x page sum against
 * a query-only sum makes a two-page query look like it doubled when nothing
 * changed. Page attribution comes from a SEPARATE query x page call whose
 * impression counts are never compared across periods.
 */

/**
 * Row limits.
 *
 * Search Console sorts rows by CLICKS and accepts up to 25,000 per call, so a
 * low limit does not merely shorten the list -- it biases it, because this
 * feature ranks by impressions. A high-impression, zero-click query is exactly
 * the opportunity worth surfacing and exactly the row a clicks-ordered cut
 * drops first. When the limit is still not enough, `currentTruncated` says so
 * rather than pretending.
 *
 * 2,500 is a MEASURED Worker CPU budget, not a guess, and not the same thing as
 * GSC_ANALYTICS_ROW_CEILING. This handler parses THREE payloads per request
 * (current queries, previous queries, query x page attribution), so it cannot
 * spend the whole per-invocation ceiling on one of them:
 *
 *   rowLimit x3 payloads    size   parse + momentum
 *      1000                0.3 MB       1.49 ms
 *      2500                0.8 MB       3.65 ms   <- here
 *      5000                1.7 MB       7.71 ms   too tight
 *
 * Measured on a dev machine, so a lower bound on isolate cost, and excluding
 * routing, auth, D1 and serialization. Workers Free allows 10 ms per
 * invocation. Raising this needs a fresh measurement, not optimism.
 *
 * The query x page pull has much higher cardinality over the same query set,
 * so its shortfall is handled separately: a missing page row is never treated
 * as proof that no page ranks (see `page`'s own comment).
 */
const QUERY_ROW_LIMIT = 2500;

const inputSchema = z.object({
  projectId: z.string().min(1),
  dateRange: z.enum(SEARCH_PERFORMANCE_RANGES).default("last_28_days"),
});

export type QueryMomentumRow = {
  query: string;
  impressions: number;
  clicks: number;
  /**
   * GSC's average position for the query at property level -- the average
   * topmost position across the result sets the site appeared in. It names no
   * single URL, which is why `page` is derived separately and why the UI must
   * never present it as "that page ranks #N".
   */
  position: number;
  /**
   * The page taking the largest share of this query's impressions, or null
   * when the attribution call returned no row for it.
   *
   * NULL MEANS "NOT ATTRIBUTED", NEVER "NO PAGE EXISTS". A query in the
   * current pull is by definition one the site was shown for, so a page of
   * theirs ranks whether or not the higher-cardinality query x page call
   * happened to include it. Consumers must not infer "write a new page" from
   * a null here -- that was a real defect this comment exists to prevent.
   */
  page: string | null;
  /** Share of the query's impressions `page` accounts for, 0..1, or null when
   *  unattributed. Computed only from rows that came back, so it is a lower
   *  bound on the true share. */
  pageShare: number | null;
};

function sumImpressionsByQuery(
  rows: ReadonlyArray<{ keys?: string[]; impressions: number }>,
): Map<string, number> {
  const byQuery = new Map<string, number>();
  for (const row of rows) {
    const query = row.keys?.[0];
    if (!query) continue;
    byQuery.set(query, (byQuery.get(query) ?? 0) + row.impressions);
  }
  return byQuery;
}

/**
 * Dominant page per query, by impression share.
 *
 * Impressions here are only ever compared BETWEEN pages of the same query in
 * the same period, never against another period, so the query x page
 * aggregation difference cannot leak into the momentum numbers.
 */
function dominantPageByQuery(
  rows: ReadonlyArray<{ keys?: string[]; impressions: number }>,
): Map<string, { page: string; share: number }> {
  const totals = new Map<string, number>();
  const best = new Map<string, { page: string; impressions: number }>();

  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;
    totals.set(query, (totals.get(query) ?? 0) + row.impressions);
    const current = best.get(query);
    if (!current || row.impressions > current.impressions) {
      best.set(query, { page, impressions: row.impressions });
    }
  }

  const out = new Map<string, { page: string; share: number }>();
  for (const [query, entry] of best) {
    const total = totals.get(query) ?? 0;
    out.set(query, {
      page: entry.page,
      share: total > 0 ? entry.impressions / total : 0,
    });
  }
  return out;
}

/**
 * Explicit union so the discriminant survives `createServerFn`'s inference,
 * which otherwise widens the two branches into one optional-everything object
 * and defeats narrowing at every call site.
 */
export type QueryMomentumResult =
  | { connected: false }
  | {
      connected: true;
      range: {
        startDate: string;
        endDate: string;
        prevStartDate: string;
        prevEndDate: string;
      };
      current: QueryMomentumRow[];
      previous: Array<{ query: string; impressions: number }>;
      /** The current pull may have been cut short, so the ranking is drawn
       *  from a clicks-ordered sample rather than from every query. */
      currentTruncated: boolean;
      /** The prior pull may have been cut short, so a row can lack a baseline
       *  for a reason other than genuinely having none. */
      previousTruncated: boolean;
    };

export const getQueryMomentum = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(inputSchema)
  .handler(async ({ data, context }): Promise<QueryMomentumResult> => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const prev = previousPeriod(startDate, endDate);
    const projectId = context.projectId;

    let current, previous, currentPages;
    try {
      [current, previous, currentPages] = await Promise.all([
        GscService.getAnalyticsPerformance({
          projectId,
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: QUERY_ROW_LIMIT,
        }),
        GscService.getAnalyticsPerformance({
          projectId,
          startDate: prev.startDate,
          endDate: prev.endDate,
          dimensions: ["query"],
          rowLimit: QUERY_ROW_LIMIT,
        }),
        // Page attribution only. Never compared across periods.
        GscService.getAnalyticsPerformance({
          projectId,
          startDate,
          endDate,
          dimensions: ["query", "page"],
          rowLimit: QUERY_ROW_LIMIT,
        }),
      ]);
    } catch (error) {
      // ONLY a missing connection degrades to an empty card. Anything else --
      // a Google 5xx, an expired token, a TypeError in our own mapping -- has
      // to reach the error path so react-query can retry and the failure stays
      // visible, instead of being disguised as "you haven't connected yet".
      if (error instanceof GscNotConnectedError) return { connected: false };
      throw error;
    }

    const pages = dominantPageByQuery(currentPages.rows);
    const currentRows: QueryMomentumRow[] = current.rows.flatMap((row) => {
      const query = row.keys?.[0];
      if (!query) return [];
      const owner = pages.get(query);
      return [
        {
          query,
          impressions: row.impressions,
          clicks: row.clicks,
          position: row.position,
          page: owner?.page ?? null,
          pageShare: owner?.share ?? null,
        },
      ];
    });

    const previousImpressions = sumImpressionsByQuery(previous.rows);

    return {
      connected: true,
      range: {
        startDate,
        endDate,
        prevStartDate: prev.startDate,
        prevEndDate: prev.endDate,
      },
      current: currentRows,
      previous: [...previousImpressions.entries()].map(
        ([query, impressions]) => ({ query, impressions }),
      ),
      // Reaching the limit means the response MAY have been clipped, not that
      // it was -- a property with exactly this many queries trips it too. The
      // UI wording hedges accordingly.
      // Compare against the limit the request ACTUALLY applied, not the one we
      // asked for. Those diverged silently until now -- the ceiling clamped
      // every call to 1000 while these lines tested against 5000, so both flags
      // were permanently false and the UI reported completeness it never had.
      currentTruncated: current.rows.length >= (current.request.rowLimit ?? 0),
      previousTruncated:
        previous.rows.length >= (previous.request.rowLimit ?? 0),
    };
  });
