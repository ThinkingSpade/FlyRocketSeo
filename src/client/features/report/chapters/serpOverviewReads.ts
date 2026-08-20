import { useQuery } from "@tanstack/react-query";
import {
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "@/serverFunctions/searchPerformance";
import type { GscAccessFailureReason } from "@/shared/gsc";

/**
 * The Search Console half of chapter 04's relevance gate.
 *
 * `serpOverview.tsx` prints a saved SERP lookup only when its keyword is one
 * Search Console already shows this site for. Deciding that is a self-contained
 * job — two free reads, one set of queries, and the sentence explaining why
 * nothing could be vouched for — so it lives here rather than inside the
 * chapter's own hook, where it was the larger half of a decision tree that also
 * walks run history.
 *
 * Both reads reuse the report's own query keys and staleTime, so a warm cache
 * costs this chapter nothing at all.
 */

/**
 * What the gate actually checked — never "all of Search Console".
 *
 * `vouched` holds at most ~110 queries: the striking-distance band, which is
 * positions 5..20 only and capped at 100 rows
 * (searchPerformanceReport.ts's STRIKING_DISTANCE_* constants), plus the ten
 * most-clicked queries of the first table page. A keyword the site ranks #2
 * for is absent from both. The earlier wording — "keywords this site does not
 * yet appear for in Search Console" — therefore printed the exact opposite of
 * the truth about a client's best keyword, in the sentence explaining why
 * their own money keyword was left out of the report.
 */
export const NO_RELEVANT_RUN =
  "None of the search-results lookups saved for this project matched the Search Console queries this report checks — the searches your site ranks 5th to 20th for, and its ten most-clicked searches, over the last 28 days — so none was used here.";
/** Search Console answered and had nothing to check against: the gate could not
 *  run, which is not the same as the lookups failing it. */
const NO_GSC_ROWS =
  "Search Console returned no queries for this project over the last 28 days, so no saved search-results lookup could be confirmed as one of your keywords.";
/**
 * Why Search Console could not vouch for a keyword — four causes, not one.
 *
 * `toGscUnavailable` distinguishes them and the report has been bitten by this
 * exact collapse before (see `describeMissingGsc` in reportChapters.tsx): an
 * expired grant or a revoked property permission on a live, correctly
 * configured connection printed as "not connected", telling the client the
 * agency never set Search Console up.
 */
export const CANNOT_VOUCH: Record<GscAccessFailureReason, string> = {
  not_connected:
    "Search Console is not connected for this project, so no saved search-results lookup could be confirmed as one of your keywords.",
  requires_reconnect:
    "The Search Console connection expired, so no saved search-results lookup could be confirmed as one of your keywords.",
  permission_denied:
    "Google denied access to the connected Search Console property, so no saved search-results lookup could be confirmed as one of your keywords.",
  api_not_configured:
    "The Search Console API is not enabled for the connected Google Cloud project, so no saved search-results lookup could be confirmed as one of your keywords.",
};

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase();
}

/** A free read under the key the dashboard already uses — same key, same
 *  staleTime — so a warm cache costs this chapter nothing at all. */
export function useFreeRead<T>(queryKey: unknown[], queryFn: () => Promise<T>) {
  return useQuery({ queryKey, queryFn, staleTime: 10 * 60_000 });
}

/**
 * The queries Search Console already shows this site for, as a gate.
 *
 * Returns a predicate rather than the set itself: the caller asks "can we
 * vouch for this keyword", and never has to remember that the comparison is
 * case- and whitespace-insensitive. `hasQueries` is the separate fact of
 * whether the gate had anything to check against at all — a gate that could
 * not run and a gate that ran and matched nothing are different sentences.
 */
export function useVouchedKeywords(projectId: string) {
  // Direct useQuery, not the useFreeRead wrapper above: the wrapper's generic
  // collapses the connected/disconnected discriminant, so `connected` stopped
  // narrowing the union and the report's own fields were unreachable. Same key
  // and staleTime as useClientReportData, so the cache is still shared.
  const gscQuery = useQuery({
    queryKey: ["report-gsc", projectId],
    queryFn: () => getSearchPerformanceReport({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });
  const topQueriesQuery = useFreeRead(["report-top-queries", projectId], () =>
    getSearchPerformanceTable({
      data: { projectId, dimension: "query", page: 1, pageSize: 25 },
    }),
  );

  const gscData = gscQuery.data;
  // Read inside the narrowed branch rather than storing the narrowed value:
  // every field the gate needs lives only on the connected member, and holding
  // it in a `const` lost the discriminant here. `reason` is kept separately, so
  // a live property whose grant expired cannot be read as never-connected.
  const striking = gscData && gscData.connected ? gscData.strikingDistance : [];
  const gscConnected = Boolean(gscData && gscData.connected);
  const gscReason = gscData && !gscData.connected ? gscData.reason : null;
  const table = topQueriesQuery.data;
  const vouched = new Set([
    ...striking.map((row) => normalizeKeyword(row.query)),
    ...(table?.connected ? table.rows.slice(0, 10) : []).map((row) =>
      normalizeKeyword(row.key),
    ),
  ]);

  return {
    /** Can Search Console vouch for this keyword? Null-safe: a run with no
     *  readable keyword is never vouched for. */
    vouches: (keyword: string | null | undefined) =>
      keyword != null && vouched.has(normalizeKeyword(keyword)),
    /** Did the gate have anything at all to check against? */
    hasQueries: vouched.size > 0,
    /** Both gate reads have answered, so a "no match" verdict is final. */
    settled: !gscQuery.isPending && !topQueriesQuery.isPending,
    /**
     * Three different truths, and one sentence used to cover all three: the
     * gate ran and nothing matched the slice it checks; the gate had nothing
     * to check against; Search Console could not answer at all, for one of
     * four reasons.
     */
    unvouchedReason: !gscConnected
      ? CANNOT_VOUCH[gscReason ?? "not_connected"]
      : vouched.size > 0
        ? NO_RELEVANT_RUN
        : NO_GSC_ROWS,
    /** Kept apart from the verdict: a thrown read is not a failed gate. */
    gscFailed: gscQuery.isError,
    topQueriesFailed: topQueriesQuery.isError,
  };
}
