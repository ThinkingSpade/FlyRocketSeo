import type { CompetitorRow } from "@/types/schemas/competitors";
import { shouldAdoptRestoredRun } from "./shouldAdoptRestoredRun";

/**
 * The restored run and the rows to show, once "is this safe to show" has
 * been decided -- pulled out of `CompetitorsPage` (alongside
 * `CompetitorsRestoreNotice`) to keep that component under this repo's
 * line-count lint cap, and into its own file (rather than staying inline)
 * once it grew a second, independently testable gate. `restoredRun` and
 * `competitorRows` always move together.
 *
 * A restored run is only ever adopted when ALL of:
 * - there is no live answer yet (`liveRows == null`) -- a live result, even
 *   an empty one, always wins.
 * - `page === 1`. `CompetitorsService.getCompetitors` only ever records a
 *   run when `input.page === 1` (deeper pages are page-specific and would
 *   misrepresent themselves as page 1 if restored under a different page
 *   number), so a restored run's rows are ALWAYS page 1's rows. Adopting one
 *   under any other page would render page 1's domains under a pager that
 *   claims to be on page N -- and since changing `page` changes the metered
 *   query's authorization key (`buildCompetitorsAuthorizationKey`),
 *   `competitorsQuery.data` is undefined on every page but the one just
 *   authorized, which is exactly the gap that let a stale restore silently
 *   stand in for a live page-2 fetch.
 * - `shouldAdoptRestoredRun` agrees the restored run's target matches the one
 *   on screen -- never show one client's cached run under another client's
 *   domain.
 */
export function pickAdoptedRestore<
  Restored extends { label: string; result: { rows: CompetitorRow[] } },
>(
  liveRows: CompetitorRow[] | undefined,
  restored: Restored | null,
  target: string,
  page: number,
): { restoredRun: Restored | null; competitorRows: CompetitorRow[] } {
  const adoptable =
    liveRows == null &&
    page === 1 &&
    shouldAdoptRestoredRun({ target, restoredLabel: restored?.label ?? null });
  const restoredRun = adoptable ? restored : null;
  return {
    restoredRun,
    competitorRows: liveRows ?? restoredRun?.result.rows ?? [],
  };
}
