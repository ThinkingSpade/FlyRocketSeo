import type { QueryClient } from "@tanstack/react-query";
import type { CompetitorsPage } from "@/types/schemas/competitors";
import type { ProjectCompetitorRow } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";

/**
 * Pure `(page) => page` transforms for patching a cached `CompetitorsPage`
 * after a pin/exclude mutation succeeds, plus the query-cache-writing
 * functions that use them -- extracted out of `useCompetitorsQueries.ts`'s
 * mutation `onSuccess` closures so all of it can be unit tested directly,
 * against a real `QueryClient`, with no server-function dependency.
 *
 * This is a separate module rather than added to `useCompetitorsQueries.ts`
 * itself for the same reason `CompetitorsTableColumns.tsx` was split from
 * `CompetitorsTable.tsx`: that file imports `@/serverFunctions/competitors`
 * at its top, which transitively reaches `cloudflare:workers` (via
 * `CompetitorsService` -> `r2-cache.ts`) -- fine for the app, fatal for a
 * plain vitest import. `@tanstack/react-query`'s `QueryClient` carries no
 * such dependency (it is a plain class, safe in any JS environment), so
 * keeping the cache-writing functions here too means their test file never
 * has to touch that graph, or mock `cloudflare:workers`, at all.
 *
 * Both patch functions leave every field they don't own untouched
 * (`totalCount`, `fetchedAt`, `seedSize`, `discoveryMode`) via object spread,
 * and no-op (return the SAME reference) when there is nothing to change on
 * this particular cached page -- see each function's own doc comment.
 */

/**
 * Applies a `setProjectCompetitor` mutation's result to one cached page.
 *
 * - `status: "pinned"` sets `pinned: true` on the matching row, if this page
 *   has one; every other row is untouched.
 * - `status: "excluded"` drops the matching row from `rows` and raises
 *   `hiddenCount` by exactly how many rows that removed (0 or 1 in practice,
 *   but written as a count rather than an increment so it stays correct if a
 *   future caller ever batches domains). Returns the SAME `page` reference,
 *   not just an equal one, when the domain was not on this page at all --
 *   `patchCachedCompetitorsPages` sweeps every LIVE cached page for the
 *   project, and most won't contain the domain being acted on. (A restored
 *   run gets no patch at all, on purpose -- see
 *   `useSetProjectCompetitorMutation`'s own doc comment in
 *   `useCompetitorsQueries.ts`.)
 */
export function applySetProjectCompetitorPatch(
  page: CompetitorsPage,
  variables: { domain: string; status: "pinned" | "excluded" },
): CompetitorsPage {
  if (variables.status === "pinned") {
    return {
      ...page,
      rows: page.rows.map((row) =>
        row.domain === variables.domain ? { ...row, pinned: true } : row,
      ),
    };
  }
  const rows = page.rows.filter((row) => row.domain !== variables.domain);
  const removed = page.rows.length - rows.length;
  return removed === 0
    ? page
    : { ...page, rows, hiddenCount: page.hiddenCount + removed };
}

/**
 * Applies a `removeProjectCompetitor` mutation's result to one cached page.
 *
 * `removeProjectCompetitor` just deletes the override row, so the SAME
 * server call means two different things depending on what triggered it --
 * `reason` says which:
 * - `"unpin"` unsets `pinned` on the matching row (a visible row that was
 *   pinned); every other row is untouched.
 * - `"unhide"` lowers `hiddenCount` by one, floored at 0. The unhidden
 *   domain was never in `rows` to begin with (excluded rows are filtered out
 *   server-side before the client ever sees them), so there is no row to
 *   restore here -- the domain only reappears once a real (paid) discovery
 *   run finds it again.
 */
export function applyRemoveProjectCompetitorPatch(
  page: CompetitorsPage,
  variables: { domain: string; reason: "unpin" | "unhide" },
): CompetitorsPage {
  if (variables.reason === "unpin") {
    return {
      ...page,
      rows: page.rows.map((row) =>
        row.domain === variables.domain ? { ...row, pinned: false } : row,
      ),
    };
  }
  return page.hiddenCount > 0
    ? { ...page, hiddenCount: page.hiddenCount - 1 }
    : page;
}

/**
 * Shared prefix for every cached `competitors-list` page for a project, no
 * matter its target/page/market. `useCompetitorsQuery` (`useCompetitorsQueries.ts`)
 * builds its own query key on top of this, and `patchCachedCompetitorsPages`
 * below matches back against exactly this prefix (TanStack Query's default
 * `queryKey` matching is "starts with") so the two can never drift apart.
 */
export function competitorsListQueryKeyPrefix(projectId: string) {
  return ["competitors-list", projectId] as const;
}

/** Query key for this project's pin/exclude overrides -- a free D1 read. */
export function projectCompetitorsQueryKey(projectId: string) {
  return ["project-competitors", projectId] as const;
}

/**
 * Rewrites every cached `competitors-list` page for this project in place,
 * rather than invalidating them.
 *
 * `competitors-list` is a metered (`useMeteredQuery`) key, and pin/exclude
 * are free D1 writes that must never cause a paid DataForSEO refetch. Calling
 * `queryClient.invalidateQueries` here would risk exactly that: verified
 * against the installed `@tanstack/query-core`, its default `refetchType:
 * "active"` refetches any matching query whose observer has `enabled !==
 * false` (`Query.isActive`) -- which describes a live, already-authorized
 * competitors run sitting on screen, the normal moment a user clicks Pin.
 * `setQueriesData` only ever writes the cache and touches the network not at
 * all, so it keeps "no automatic spend" true even then. The `{ queryKey:
 * competitorsListQueryKeyPrefix(projectId) }` filter partial-matches every
 * cached page for this project regardless of its target/page/market suffix.
 */
function patchCachedCompetitorsPages(
  queryClient: QueryClient,
  projectId: string,
  updater: (page: CompetitorsPage) => CompetitorsPage,
): void {
  queryClient.setQueriesData<CompetitorsPage>(
    { queryKey: competitorsListQueryKeyPrefix(projectId) },
    (page) => (page ? updater(page) : page),
  );
}

/**
 * What a successful pin/exclude mutation writes into the query cache.
 *
 * This function's job is to touch the overrides cache and the LIVE
 * competitors-list cache and NOTHING else. It deliberately does NOT touch
 * `["analysisRun","latest",projectId,"competitors"]` (the restored-run entry
 * `useRestoredCompetitorsRun` reads and treats as a pristine snapshot -- see
 * `reapplyRestoredOverrides.ts`'s own doc comment). An earlier version of
 * this codebase DID patch that entry too (`patchCachedRestoredCompetitorsRun`,
 * now deleted): it collided with `reapplyProjectCompetitors`'s pristine-input
 * requirement, since the excluded row was already gone from the restored
 * snapshot by the time re-derivation ran there, so the freshly computed
 * `hiddenCount` came out 0, not 1 -- and the only unhide entry point
 * (`CompetitorsDiscoveryNotice`'s "Manage" button, gated on
 * `hiddenCount > 0`) disappeared for the rest of the session. See
 * `competitorsCacheUpdaters.test.ts`'s `applyProjectCompetitorMutationSuccess`
 * block for the regression test.
 */
export function applyProjectCompetitorMutationSuccess(
  queryClient: QueryClient,
  projectId: string,
  overrides: ProjectCompetitorRow[],
  updater: (page: CompetitorsPage) => CompetitorsPage,
): void {
  queryClient.setQueryData(projectCompetitorsQueryKey(projectId), overrides);
  patchCachedCompetitorsPages(queryClient, projectId, updater);
}
