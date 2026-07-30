import type { GscSearchAnalyticsRequest } from "@/server/lib/gscClient";

// Shared option sets — also drive the MCP tool Zod schemas so the two stay in sync.
export const GSC_DIMENSIONS = [
  "query",
  "page",
  "country",
  "device",
  "date",
  "searchAppearance",
] as const;
export const GSC_FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
] as const;
export const GSC_SEARCH_TYPES = [
  "web",
  "image",
  "video",
  "news",
  "googleNews",
  "discover",
] as const;
export const GSC_DATE_RANGES = [
  "last_7_days",
  "last_28_days",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "last_16_months",
] as const;

export const GSC_DEFAULT_ROW_LIMIT = 1000;
// The MCP tool path caps rows-per-call to protect the agent's context window.
// The GSC API supports up to 25000; we keep fetched == returned there so counts
// stay honest, and the agent paginates with `startRow` for more.
export const GSC_MCP_ROW_CEILING = 1000;
// The analytics UI has no context-window constraint, so it gets its own
// ceiling. It used to inherit the MCP cap, which made downstream truncation
// flags unreachable: callers requested 5000, silently received 1000, then
// tested `rows.length >= 5000` and always concluded "not truncated".
//
// 5000 is a CPU limit, not an API limit -- GSC itself allows 25000 per request.
// Measured by scripts/measure-gsc-aggregation.ts against the real aggregation
// functions, as JSON.parse + aggregate on one invocation (dev machine, so a
// LOWER bound on isolate cost):
//
//   rows     payload   parse    aggregate   total
//    1000     0.1 MB   0.33ms      0.51ms   0.84ms
//    5000     0.7 MB   1.83ms      1.55ms   3.38ms   <- here
//   10000     1.3 MB   4.12ms      2.22ms   6.35ms   too tight
//   25000     3.3 MB   8.76ms      6.91ms  15.67ms   over budget
//
// Workers Free allows 10ms CPU per invocation, shared with routing, auth, D1
// round trips and response serialization. Parsing dominates, so raising this
// is not free even when the aggregation looks cheap. Do NOT paginate past this
// on a path that parses and aggregates in-request: report truncation instead.
export const GSC_ANALYTICS_ROW_CEILING = 5000;
// GSC data trails by ~2-3 days; default the end of convenience ranges before it.
const GSC_DATA_LAG_DAYS = 3;

export type GscAggregationType = "auto" | "byPage" | "byProperty";

export type GscDimension = (typeof GSC_DIMENSIONS)[number];
type GscFilterOperator = (typeof GSC_FILTER_OPERATORS)[number];
export type GscSearchType = (typeof GSC_SEARCH_TYPES)[number];
export type GscDateRange = (typeof GSC_DATE_RANGES)[number];

export type GscPerformanceFilter = {
  dimension: GscDimension;
  operator: GscFilterOperator;
  expression: string;
};

export type GscPerformanceInput = {
  projectId: string;
  dimensions?: GscDimension[];
  dateRange?: GscDateRange;
  startDate?: string;
  endDate?: string;
  filters?: GscPerformanceFilter[];
  rowLimit?: number;
  startRow?: number;
  type?: GscSearchType;
  dataState?: "all" | "final";
  /** How Google should aggregate. Left unset this defaults to `"auto"`, meaning
   *  Google chooses and the caller cannot know what it got. Set `"byProperty"`
   *  for demand totals: page aggregation counts each displayed URL separately,
   *  so a property showing two URLs for one query yields two impressions
   *  instead of one. Note that grouping or filtering by `page` forces page
   *  aggregation regardless of what is requested here. */
  aggregationType?: GscAggregationType;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The calendar date in Pacific Time for a given instant, as a UTC-midnight Date
 * so every later step is plain calendar arithmetic.
 *
 * Google interprets Search Analytics `startDate` and `endDate` in Pacific Time
 * ("All dates are in Pacific Time Zone (PT)"). Deriving them from UTC meant that
 * for the seven or eight hours between Pacific midnight and UTC midnight, every
 * convenience range was a day ahead of the calendar Google was using.
 */
function pacificCalendarDate(instant: Date): Date {
  // en-CA renders as YYYY-MM-DD, which is the format GSC wants anyway.
  const pacific = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return new Date(`${pacific}T00:00:00Z`);
}

/**
 * Start date for a named range ending inclusively at `end`.
 *
 * Day-named ranges subtract N-1, not N: both endpoints are included, so
 * subtracting a full 28 produced 29 dates for "last 28 days" and 8 for "last 7
 * days". Every headline period comparison was built on a window one day longer
 * than its own label, which also shifted its weekday mix against the previous
 * period.
 *
 * Month-named ranges keep calendar-month arithmetic — "3 months" means three
 * months back, not 90 days — but they are inclusive too, so they subtract from
 * the day AFTER the end and step back one day. Subtracting from the end date
 * itself yielded one extra day: "last 12 months" ending 2026-05-31 started
 * 2025-05-31, which is 366 inclusive dates.
 */
/**
 * Step back whole calendar months, clamping to the target month's last day.
 *
 * Raw `setUTCMonth` OVERFLOWS: asking for 31 February rolls forward into March.
 * That silently moved "last 3 months" from 2026-05-31 to a 2026-03-03 start,
 * dropping March 1-2, and shifted the 16-month floor on any month-end day.
 */
function monthsBefore(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - months;
  // Day 0 of the following month is the last day of the target month, which
  // gives the clamp with no calendar table or leap-year special case.
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(date.getUTCDate(), lastDayOfTarget)),
  );
}

function subtractMonths(end: Date, months: number): Date {
  // Work from an exclusive end (end + 1 day) so the resulting range is
  // inclusive. Subtracting from the end date itself yielded one extra day:
  // "last 12 months" ending 2026-05-31 started 2025-05-31, or 366 dates.
  const exclusiveEnd = new Date(end);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  return monthsBefore(exclusiveEnd, months);
}

function subtractRange(end: Date, range: GscDateRange): Date {
  const d = new Date(end);
  switch (range) {
    case "last_7_days":
      d.setUTCDate(d.getUTCDate() - 6);
      return d;
    case "last_28_days":
      d.setUTCDate(d.getUTCDate() - 27);
      return d;
    case "last_3_months":
      return subtractMonths(end, 3);
    case "last_6_months":
      return subtractMonths(end, 6);
    case "last_12_months":
      return subtractMonths(end, 12);
    case "last_16_months":
      return subtractMonths(end, 16);
  }
}

function sixteenMonthFloor(today: Date): string {
  // A boundary, not an inclusive range start, so no exclusive-end adjustment —
  // but it still needs the clamp, or the floor jumps a day on month-end dates.
  return formatDate(monthsBefore(today, 16));
}

/** Resolve a convenience `dateRange` or explicit start/end into GSC dates.
 *
 *  `now` is injectable for deterministic tests. It is an INSTANT, converted to
 *  the Pacific calendar date immediately, because that is the calendar Google
 *  reads these dates against. */
export function resolveDateRange(
  input: Pick<GscPerformanceInput, "dateRange" | "startDate" | "endDate">,
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  const today = pacificCalendarDate(now);
  const floor = sixteenMonthFloor(today);

  if (input.startDate && input.endDate) {
    // Clamp the start to GSC's 16-month lower bound.
    const startDate = input.startDate < floor ? floor : input.startDate;
    return { startDate, endDate: input.endDate };
  }

  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() - GSC_DATA_LAG_DAYS);
  const start = subtractRange(end, input.dateRange ?? "last_28_days");
  const startDate = formatDate(start);
  return {
    startDate: startDate < floor ? floor : startDate,
    endDate: formatDate(end),
  };
}

/** Build the GSC `searchAnalytics.query` body from validated tool input.
 *  Critically, flat `filters` are wrapped into `dimensionFilterGroups` — GSC
 *  silently ignores a top-level `filters` field. */
export function buildSearchAnalyticsRequest(
  input: GscPerformanceInput,
  today: Date = new Date(),
  ceiling: number = GSC_MCP_ROW_CEILING,
): GscSearchAnalyticsRequest {
  const { startDate, endDate } = resolveDateRange(input, today);
  const request: GscSearchAnalyticsRequest = {
    startDate,
    endDate,
    dimensions:
      input.dimensions && input.dimensions.length > 0
        ? input.dimensions
        : ["query"],
    rowLimit: clamp(input.rowLimit ?? GSC_DEFAULT_ROW_LIMIT, 1, ceiling),
    type: input.type ?? "web",
    dataState: input.dataState ?? "all",
  };
  if (input.aggregationType) {
    request.aggregationType = input.aggregationType;
  }
  if (input.startRow && input.startRow > 0) {
    request.startRow = input.startRow;
  }
  if (input.filters && input.filters.length > 0) {
    request.dimensionFilterGroups = [
      { groupType: "and", filters: input.filters },
    ];
  }
  return request;
}
