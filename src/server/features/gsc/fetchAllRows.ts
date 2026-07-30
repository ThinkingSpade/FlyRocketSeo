import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

/**
 * Anything that can be asked for a window of rows.
 *
 * Deliberately structural so this works at both layers: the low-level
 * `GscSearchAnalyticsRequest` and the service-level `GscPerformanceInput` both
 * satisfy it, and neither has to know about the other.
 */
type PaginableRequest = {
  rowLimit?: number;
  startRow?: number;
};

/**
 * GSC's documented maximum rows per `searchanalytics.query` request.
 *
 * Our own ceiling (`GSC_ANALYTICS_ROW_CEILING`) sits well below this because
 * the binding constraint is Worker CPU, not the API. Page size is capped here
 * only so that a lower provider maximum degrades into more round trips instead
 * of a silent under-fetch.
 */
const GSC_MAX_ROWS_PER_REQUEST = 25_000;

/**
 * What a GSC pull actually examined.
 *
 * `truncated` means our ceiling stopped the pull, so the absence of a row is
 * NOT evidence that the row does not exist. GSC orders rows by clicks
 * descending and documents that it returns top rows rather than every matching
 * row, so any UI claiming "none found" MUST branch on this flag.
 */
type GscRowResult = {
  rows: GscSearchAnalyticsRow[];
  rowsExamined: number;
  truncated: boolean;
};

type QueryFn<T extends PaginableRequest> = (
  request: T,
) => Promise<GscSearchAnalyticsRow[]>;

/**
 * Did this pull come back full, meaning there may be more we did not see?
 *
 * The single definition of truncation for callers that issue one request rather
 * than going through `fetchAllRows`. Compare against the limit the request
 * ACTUALLY applied — `request.rowLimit` after clamping — never the limit the
 * caller asked for. Those two diverged silently for every analytics path, which
 * is why truncation went undetected in the first place.
 */
export function pullWasTruncated(pull: {
  rows: unknown[];
  request: { rowLimit?: number };
}): boolean {
  return pull.rows.length >= (pull.request.rowLimit ?? 0);
}

/**
 * Fetch up to `ceiling` rows and report whether the ceiling cut the pull short.
 *
 * Typically this makes exactly ONE request: the ceiling is smaller than the
 * provider's per-request maximum, so there is nothing to paginate. The loop
 * exists so that a caller-supplied `rowLimit` below the ceiling still reaches
 * the ceiling rather than stopping at the first page.
 *
 * Exhaustion is inferred from a short page — fewer rows returned than
 * requested. Google documents this directly: "if you get less than the number
 * of rows requested, you have retrieved all the data." Filling the request
 * exactly is treated as "there may be more", which is both the conservative
 * reading and what keeps absence claims honest.
 *
 * Two limits this CANNOT overcome, so callers must not read a `truncated:
 * false` result as "we have every underlying search event":
 *
 * - GSC exposes only top rows and drops detail; anonymized queries never
 *   appear at all. Exhausting the exposed result set is not exhausting reality.
 * - Rows tied on clicks have arbitrary order, and separate requests are not a
 *   snapshot. Across page boundaries, tied rows can therefore repeat or be
 *   skipped. That is a provider property, not something this loop can fix —
 *   which is a further reason to prefer one large request over many small ones.
 */
export async function fetchAllRows<T extends PaginableRequest>(
  query: QueryFn<T>,
  // Takes T rather than Omit<T, "startRow"> so the generic infers from a plain
  // object literal at the call site. Any `startRow` passed in is overwritten:
  // this function owns the offset.
  request: T,
  ceiling: number,
): Promise<GscRowResult> {
  // A zero or negative ceiling has no honest answer, and a zero page size would
  // request nothing forever: `0 < ceiling` stays true while `collected` never
  // grows. Fail loudly rather than hang a request.
  if (!Number.isInteger(ceiling) || ceiling < 1) {
    throw new Error(
      `fetchAllRows: ceiling must be a positive integer, got ${ceiling}`,
    );
  }
  const requested = request.rowLimit ?? ceiling;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error(
      `fetchAllRows: rowLimit must be a positive integer, got ${requested}`,
    );
  }

  const pageSize = Math.min(requested, ceiling, GSC_MAX_ROWS_PER_REQUEST);
  const collected: GscSearchAnalyticsRow[] = [];

  while (collected.length < ceiling) {
    // Never request more than the ceiling leaves room for: overshooting costs
    // parse CPU on rows we would immediately discard.
    const wanted = Math.min(pageSize, ceiling - collected.length);
    const page = await query({
      ...request,
      rowLimit: wanted,
      ...(collected.length > 0 ? { startRow: collected.length } : {}),
    } as T);

    // Clip rather than trust: a provider returning more than it was asked for
    // would otherwise blow through the ceiling this function exists to enforce,
    // and the ceiling is a CPU budget, not a preference.
    collected.push(...(page.length > wanted ? page.slice(0, wanted) : page));

    if (page.length < wanted) {
      return {
        rows: collected,
        rowsExamined: collected.length,
        truncated: false,
      };
    }
  }

  return {
    rows: collected,
    rowsExamined: collected.length,
    truncated: true,
  };
}
