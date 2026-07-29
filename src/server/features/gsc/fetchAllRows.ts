import type {
  GscSearchAnalyticsRequest,
  GscSearchAnalyticsRow,
} from "@/server/lib/gscClient";

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
export type GscRowResult = {
  rows: GscSearchAnalyticsRow[];
  rowsExamined: number;
  truncated: boolean;
};

type QueryFn = (
  request: GscSearchAnalyticsRequest,
) => Promise<GscSearchAnalyticsRow[]>;

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
export async function fetchAllRows(
  query: QueryFn,
  request: Omit<GscSearchAnalyticsRequest, "startRow">,
  ceiling: number,
): Promise<GscRowResult> {
  const pageSize = Math.min(
    request.rowLimit ?? ceiling,
    ceiling,
    GSC_MAX_ROWS_PER_REQUEST,
  );
  const collected: GscSearchAnalyticsRow[] = [];

  while (collected.length < ceiling) {
    // Never request more than the ceiling leaves room for: overshooting costs
    // parse CPU on rows we would immediately discard.
    const wanted = Math.min(pageSize, ceiling - collected.length);
    const page = await query({
      ...request,
      rowLimit: wanted,
      ...(collected.length > 0 ? { startRow: collected.length } : {}),
    });

    collected.push(...page);

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
