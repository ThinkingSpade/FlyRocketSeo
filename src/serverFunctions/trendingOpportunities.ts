import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { GscService } from "@/server/features/gsc/services/GscService";
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
 * stays behind a click.
 *
 * BOTH period fetches use `dimensions: ["query"]`, and that symmetry is not
 * incidental -- it is the correctness condition for the whole feature. Google
 * aggregates impressions differently per dimension set: query-only counts one
 * impression per property appearance, while query x page counts one per URL
 * shown. Comparing a query x page sum against a query-only sum makes a
 * two-page query look like it doubled when nothing changed at all. Page
 * attribution comes from a SEPARATE query x page call whose impression counts
 * are never compared across periods.
 */

/** GSC's practical per-call ceiling for this shape; matches
 *  `STRIKING_DISTANCE_FETCH_LIMIT` in searchPerformance.ts. */
const QUERY_ROW_LIMIT = 1000;

const inputSchema = z.object({
  projectId: z.string().min(1),
  dateRange: z.enum(SEARCH_PERFORMANCE_RANGES).default("last_28_days"),
});

export type QueryMomentumRow = {
  query: string;
  impressions: number;
  clicks: number;
  /**
   * GSC's own average position for the query at property level -- the average
   * topmost position across the result sets the site appeared in. It names no
   * single URL, which is why `page` is derived separately and why the UI must
   * not present this as "the position of that page".
   */
  position: number;
  /** The page taking the largest share of this query's impressions, or null.
   *  Chosen by impressions, never by best position: the page that is actually
   *  being seen is the one any fix should target. */
  page: string | null;
  /** Share of the query's impressions that `page` accounts for, 0..1. Below
   *  ~0.6 the query genuinely fans out and no single page owns it. */
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

    try {
      const [current, previous, currentPages] = await Promise.all([
        GscService.getPerformance({
          projectId,
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: QUERY_ROW_LIMIT,
        }),
        GscService.getPerformance({
          projectId,
          startDate: prev.startDate,
          endDate: prev.endDate,
          dimensions: ["query"],
          rowLimit: QUERY_ROW_LIMIT,
        }),
        // Page attribution only. Never compared across periods.
        GscService.getPerformance({
          projectId,
          startDate,
          endDate,
          dimensions: ["query", "page"],
          rowLimit: QUERY_ROW_LIMIT,
        }),
      ]);

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
        connected: true as const,
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
        /**
         * Whether the prior pull was clipped. Necessary but NOT sufficient
         * evidence that a missing query is genuinely new: Search Console sorts
         * by clicks and does not guarantee every row even below the requested
         * limit, and anonymised queries are withheld entirely. The momentum
         * model therefore never claims novelty at all -- it reports "no
         * baseline" -- and this flag only decides whether the UI explains why.
         */
        previousTruncated: previous.rows.length >= QUERY_ROW_LIMIT,
      };
    } catch {
      // A missing or broken Search Console connection costs the user this
      // list, never the tab. The comparison chart below it still works.
      return { connected: false as const };
    }
  });
