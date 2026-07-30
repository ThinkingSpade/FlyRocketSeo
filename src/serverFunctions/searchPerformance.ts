import { createServerFn } from "@tanstack/react-start";
import {
  GscService,
  toGscUnavailable,
} from "@/server/features/gsc/services/GscService";
import {
  GSC_ANALYTICS_ROW_CEILING,
  resolveDateRange,
  type GscPerformanceFilter,
} from "@/server/features/gsc/searchAnalytics";
import {
  fetchAllRows,
  pullWasTruncated,
} from "@/server/features/gsc/fetchAllRows";
import { buildPropertyQueryTotals } from "@/server/features/gsc/gscAggregation";
import {
  buildCtrOpportunityRows,
  buildStrikingDistanceRows,
  previousPeriod,
  sumSearchTotals,
  toDimensionRows,
  toQueryPageRows,
} from "@/server/features/gsc/searchPerformanceReport";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  searchPerformanceInputSchema,
  searchPerformanceTableExportInputSchema,
  searchPerformanceTableInputSchema,
} from "@/types/schemas/search-performance";

// query x page fan-out needs more rows to find the 5..20 band.
const STRIKING_DISTANCE_FETCH_LIMIT = 1000;
// Property-aggregated query rows for demand totals. One key per row rather than
// two, so cheaper to parse than a query x page pull of the same size.
//
// This is the FIFTH concurrent pull in getSearchPerformanceReport, so it was
// measured rather than assumed safe: all five payloads together
// (200 + 200 + 1000 + 2500 + 25 rows, 0.32 MB) parse and aggregate in ~3.0ms
// median on a dev machine, inside the 10ms Workers Free CPU budget. Raising this
// or adding a sixth pull needs a fresh measurement -- parse cost, not
// aggregation, is what grows.
const QUERY_TOTALS_FETCH_LIMIT = 2500;
// dimensions:["date"] returns one row per day; the longest range is ~92 days.
const DAILY_ROW_LIMIT = 200;
const COUNTRY_ROW_LIMIT = 25;
// Rows per export request. Deliberately EQUAL to the ceiling, so an export is
// exactly one request.
//
// This started at 1000, which meant five paginated requests -- and GSC gives
// click-tied rows an arbitrary order across separate requests, so offset
// pagination could return a row twice and skip another. A duplicated row in a
// spreadsheet the user is about to make decisions from is worse than a smaller
// export. One request cannot straddle a tie.
const EXPORT_PAGE_SIZE = GSC_ANALYTICS_ROW_CEILING;
// Total rows an export will examine. Beyond this the file is truncated and says
// so, rather than claiming to be the full dataset — GSC orders rows by clicks
// descending, so a silent cut drops the least-clicked rows without a trace.
const EXPORT_ROW_CEILING = GSC_ANALYTICS_ROW_CEILING;

type GscPull = {
  rows: unknown[];
  request: { rowLimit?: number };
};

/**
 * How complete one GSC pull was.
 *
 * Per-pull rather than combined. An earlier version ORed the flags of several
 * differently sized pulls while reporting only one pull's row count, so the UI
 * could say Search Console "returned 700 query-and-page rows and stopped there"
 * when that pull had finished early and a different, larger pull was the one
 * that hit its limit. A flag and a count that describe different requests cannot
 * produce an honest sentence.
 *
 * Consumers must read the entry for the pull their claim actually rests on.
 */
function describePull(pull: GscPull) {
  return {
    truncated: pullWasTruncated(pull),
    rowsExamined: pull.rows.length,
  };
}

/** Build GSC filter groups shared by every call. Device applies everywhere;
 *  country applies everywhere except the country breakdown itself (so the
 *  dropdown keeps every option visible while one country is selected). */
function buildGscFilters(data: { device?: string; country?: string }): {
  deviceFilters: GscPerformanceFilter[];
  filters: GscPerformanceFilter[];
} {
  const deviceFilters: GscPerformanceFilter[] = data.device
    ? [{ dimension: "device", operator: "equals", expression: data.device }]
    : [];
  const filters: GscPerformanceFilter[] = data.country
    ? [
        ...deviceFilters,
        { dimension: "country", operator: "equals", expression: data.country },
      ]
    : deviceFilters;
  return { deviceFilters, filters };
}

/**
 * The Search Performance overview: current + previous-period totals, the
 * striking-distance rows, and the country list that powers the filter dropdown.
 * The queries/pages tables paginate separately (getSearchPerformanceTable) so
 * page-flips never re-run the striking-distance scan. All first-party GSC data,
 * free.
 */
export const getSearchPerformanceReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchPerformanceInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const prev = previousPeriod(startDate, endDate);
    const projectId = context.projectId;
    const { deviceFilters, filters } = buildGscFilters(data);

    try {
      const [current, previous, queryPages, queryTotalsPull, countries] =
        await Promise.all([
          GscService.getAnalyticsPerformance({
            projectId,
            startDate,
            endDate,
            dimensions: ["date"],
            filters,
            rowLimit: DAILY_ROW_LIMIT,
          }),
          GscService.getAnalyticsPerformance({
            projectId,
            startDate: prev.startDate,
            endDate: prev.endDate,
            dimensions: ["date"],
            filters,
            rowLimit: DAILY_ROW_LIMIT,
          }),
          GscService.getAnalyticsPerformance({
            projectId,
            startDate,
            endDate,
            dimensions: ["query", "page"],
            filters,
            rowLimit: STRIKING_DISTANCE_FETCH_LIMIT,
          }),
          // Query demand totals need their OWN property-aggregated pull. They
          // used to be summed out of the query x page rows above, which
          // double-counts: Google counts a property once per impression however
          // many of its URLs appear, while page rows count each URL. GSC is
          // free, so the extra call costs latency, not money.
          GscService.getAnalyticsPerformance({
            projectId,
            startDate,
            endDate,
            dimensions: ["query"],
            filters,
            rowLimit: QUERY_TOTALS_FETCH_LIMIT,
            aggregationType: "byProperty",
          }),
          GscService.getAnalyticsPerformance({
            projectId,
            startDate,
            endDate,
            dimensions: ["country"],
            filters: deviceFilters,
            rowLimit: COUNTRY_ROW_LIMIT,
          }),
        ]);

      return {
        connected: true as const,
        range: {
          startDate,
          endDate,
          prevStartDate: prev.startDate,
          prevEndDate: prev.endDate,
        },
        totals: sumSearchTotals(current.rows),
        prevTotals: sumSearchTotals(previous.rows),
        strikingDistance: buildStrikingDistanceRows(queryPages.rows),
        ctrOpportunities: buildCtrOpportunityRows(queryPages.rows),
        queryTotals: buildPropertyQueryTotals(queryTotalsPull.rows),
        queryPages: toQueryPageRows(queryPages.rows),
        countries: toDimensionRows(countries.rows),
        // Named per pull, so each consumer branches on the source its own
        // claim rests on rather than on an unrelated request's shortfall.
        sampling: {
          queryPages: describePull(queryPages),
          queryTotals: describePull(queryTotalsPull),
        },
      };
    } catch (error) {
      return toGscUnavailable(error, {
        projectId,
        surface: "searchPerformanceReport",
      });
    }
  });

/**
 * One page of the queries or pages table, paginated server-side against GSC via
 * `startRow` so it scales to large properties. GSC returns no total count, so we
 * fetch one extra row to detect a next page. All first-party GSC data, free.
 */
export const getSearchPerformanceTable = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchPerformanceTableInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const { filters } = buildGscFilters(data);
    const offset = (data.page - 1) * data.pageSize;

    try {
      const result = await GscService.getAnalyticsPerformance({
        projectId: context.projectId,
        startDate,
        endDate,
        dimensions: [data.dimension],
        filters,
        // One extra row tells us whether a further page exists.
        rowLimit: data.pageSize + 1,
        startRow: offset,
      });

      const fetched = toDimensionRows(result.rows);
      const hasNextPage = fetched.length > data.pageSize;
      const rows = hasNextPage ? fetched.slice(0, data.pageSize) : fetched;

      return {
        connected: true as const,
        dimension: data.dimension,
        page: data.page,
        pageSize: data.pageSize,
        hasNextPage,
        rows,
      };
    } catch (error) {
      return toGscUnavailable(error, {
        projectId: context.projectId,
        surface: "searchPerformanceTable",
      });
    }
  });

/**
 * The queries/pages dataset for CSV/Sheets export, rather than only the visible
 * page.
 *
 * Paginates to EXPORT_ROW_CEILING and reports whether it got everything. It used
 * to take one 1000-row page and describe the result as the full dataset, which
 * silently dropped the least-clicked rows: GSC orders by clicks descending, so
 * the rows a user is most likely to be hunting for in a spreadsheet are exactly
 * the ones that went missing.
 */
export const exportSearchPerformanceTable = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchPerformanceTableExportInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const { filters } = buildGscFilters(data);

    const pull = await fetchAllRows(
      (request) =>
        GscService.getAnalyticsPerformance(request).then((r) => r.rows),
      {
        projectId: context.projectId,
        startDate,
        endDate,
        dimensions: [data.dimension],
        filters,
        rowLimit: EXPORT_PAGE_SIZE,
      },
      EXPORT_ROW_CEILING,
    );

    return {
      dimension: data.dimension,
      rows: toDimensionRows(pull.rows),
      rowsExamined: pull.rowsExamined,
      truncated: pull.truncated,
    };
  });

// Page-level rows for the content analyzer; one row per page, both periods.
const CONTENT_PAGE_ROW_LIMIT = 1000;

/** Flatten page-dimension rows, dropping any without a URL key. */
function toContentPages(
  rows: Awaited<ReturnType<typeof GscService.getPerformance>>["rows"],
) {
  return rows
    .map((row) => ({
      page: row.keys?.[0] ?? "",
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    }))
    .filter((row) => row.page !== "");
}

/**
 * Page performance for the current period and the one before it — the input
 * for position buckets and content-group comparisons. All first-party GSC
 * data, free.
 */
export const getContentPerformance = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchPerformanceInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({
      dateRange: data.dateRange,
    });
    const prev = previousPeriod(startDate, endDate);
    const projectId = context.projectId;
    const { filters } = buildGscFilters(data);

    try {
      const [current, previous] = await Promise.all([
        GscService.getAnalyticsPerformance({
          projectId,
          startDate,
          endDate,
          dimensions: ["page"],
          filters,
          rowLimit: CONTENT_PAGE_ROW_LIMIT,
        }),
        GscService.getAnalyticsPerformance({
          projectId,
          startDate: prev.startDate,
          endDate: prev.endDate,
          dimensions: ["page"],
          filters,
          rowLimit: CONTENT_PAGE_ROW_LIMIT,
        }),
      ]);

      return {
        connected: true as const,
        range: { startDate, endDate },
        current: toContentPages(current.rows),
        previous: toContentPages(previous.rows),
        // Both periods are independently truncated to the top pages by clicks.
        // That matters more here than elsewhere: comparing two separately
        // sampled populations can manufacture apparent movement between periods
        // when the complete data did not change at all.
        sampling: {
          current: describePull(current),
          previous: describePull(previous),
        },
      };
    } catch (error) {
      return toGscUnavailable(error, {
        projectId,
        surface: "contentPerformance",
      });
    }
  });
