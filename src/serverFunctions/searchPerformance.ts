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
import { fetchAllRows } from "@/server/features/gsc/fetchAllRows";
import {
  buildCtrOpportunityRows,
  buildQueryTotals,
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
// dimensions:["date"] returns one row per day; the longest range is ~92 days.
const DAILY_ROW_LIMIT = 200;
const COUNTRY_ROW_LIMIT = 25;
// Rows per export request. GSC allows 25000 per call, but the binding limit is
// Worker CPU: parsing a 25000-row payload alone costs ~9ms of a 10ms budget.
const EXPORT_PAGE_SIZE = 1000;
// Total rows an export will examine. Beyond this the file is truncated and says
// so, rather than claiming to be the full dataset — GSC orders rows by clicks
// descending, so a silent cut drops the least-clicked rows without a trace.
const EXPORT_ROW_CEILING = GSC_ANALYTICS_ROW_CEILING;

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
      const [current, previous, queryPages, countries] = await Promise.all([
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
        queryTotals: buildQueryTotals(queryPages.rows),
        queryPages: toQueryPageRows(queryPages.rows),
        countries: toDimensionRows(countries.rows),
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
      };
    } catch (error) {
      return toGscUnavailable(error, {
        projectId,
        surface: "contentPerformance",
      });
    }
  });
