import type { CompetitorsPage } from "@/types/schemas/competitors";

/**
 * Pure `(page) => page` transforms for patching a cached `CompetitorsPage`
 * after a pin/exclude mutation succeeds -- extracted out of
 * `useCompetitorsQueries.ts`'s mutation `onSuccess` closures so they can be
 * unit tested directly, with no React Query / server-function dependency.
 *
 * This is a separate module rather than added to `useCompetitorsQueries.ts`
 * itself for the same reason `CompetitorsTableColumns.tsx` was split from
 * `CompetitorsTable.tsx`: that file imports `@/serverFunctions/competitors`
 * at its top, which transitively reaches `cloudflare:workers` (via
 * `CompetitorsService` -> `r2-cache.ts`) -- fine for the app, fatal for a
 * plain vitest import. Keeping these two functions here means their test
 * file never has to touch that graph at all.
 *
 * Both functions leave every field they don't own untouched (`totalCount`,
 * `fetchedAt`, `seedSize`, `discoveryMode`) via object spread, and no-op
 * (return the SAME reference) when there is nothing to change on this
 * particular cached page -- see each function's own doc comment.
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
 *   `patchCachedCompetitorsPages`/`patchCachedRestoredCompetitorsRun` sweep
 *   every cached page for the project, and most won't contain the domain
 *   being acted on.
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
