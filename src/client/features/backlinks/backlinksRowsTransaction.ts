import {
  BACKLINKS_FILTER_FIELDS,
  type BacklinksTabFilterValues,
} from "./backlinksFilterTypes";

/**
 * Guards the paid row query while a multi-part state change lands.
 *
 * Applying a drill-down changes the sub-tab, the grouping view, the filters and
 * the page. Filters are urgent React state while the rest lives in the router,
 * so they do not commit together: between them sits at least one render whose
 * (filters, page, view) combination is a *distinct query key* nobody asked for.
 * Enabling the query there bills DataForSEO for a request the user never
 * requested and never sees.
 *
 * So a change records the signature it expects to arrive at, and the query
 * stays disabled until the live state matches it exactly. One activation, one
 * request. The transaction aborts if the target or scope moves underneath it,
 * so a failed or superseded navigation can never wedge the table off.
 */

export type RowsRequestSignature = {
  target: string;
  scope: string;
  tab: string;
  /** "all" | "one-per-domain" — decides `as_is` vs `one_per_domain`. */
  view: string;
  page: number;
  pageSize: number;
  /** Applied filter values, serialized in a stable field order. */
  filters: string;
};

/** Stable regardless of key insertion order, so two equal filter sets match. */
export function serializeFilterValues(
  values: BacklinksTabFilterValues,
): string {
  return JSON.stringify(
    BACKLINKS_FILTER_FIELDS.map((field) => [field, values[field].trim()]),
  );
}

export function buildRowsSignature(input: {
  target: string;
  scope: string;
  tab: string;
  view: string | undefined;
  page: number;
  pageSize: number;
  filters: BacklinksTabFilterValues;
}): RowsRequestSignature {
  return {
    target: input.target.trim(),
    scope: input.scope,
    tab: input.tab,
    view: input.view === "all" ? "all" : "one-per-domain",
    page: input.page,
    pageSize: input.pageSize,
    filters: serializeFilterValues(input.filters),
  };
}

export function rowsSignaturesMatch(
  a: RowsRequestSignature,
  b: RowsRequestSignature,
): boolean {
  return (
    a.target === b.target &&
    a.scope === b.scope &&
    a.tab === b.tab &&
    a.view === b.view &&
    a.page === b.page &&
    a.pageSize === b.pageSize &&
    a.filters === b.filters
  );
}

/**
 * The query may run when no transaction is pending, or when the one pending has
 * fully arrived. Anything else is an intermediate state.
 */
export function isRowsQueryReleased(
  pending: RowsRequestSignature | null,
  current: RowsRequestSignature,
): boolean {
  return pending === null || rowsSignaturesMatch(pending, current);
}

/**
 * A transaction only owns the target and scope it was opened against. If either
 * moves — a new search, a restored run, a project switch — it is stale and must
 * be dropped rather than left holding the query closed forever.
 */
export function isRowsTransactionStale(
  pending: RowsRequestSignature,
  current: Pick<RowsRequestSignature, "target" | "scope">,
): boolean {
  return (
    pending.target !== current.target.trim() || pending.scope !== current.scope
  );
}
