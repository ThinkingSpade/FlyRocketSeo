import { reapplyProjectCompetitors } from "@/server/features/competitors/applyProjectCompetitors";
import type { CompetitorsPage } from "@/types/schemas/competitors";
import type { ProjectCompetitorRow } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";

/**
 * Shape of `useAutoRestoredRun`'s return when restoring a competitors run
 * specifically (`schema: competitorsPageSchema`). Declared locally rather
 * than imported: the hook is feature-agnostic and keeps its `AutoRestoredRun`
 * type private (see `CompetitorsRestoredRunBanner.tsx`'s own structural prop
 * type for the same reason).
 */
type RestoredCompetitorsRun = {
  result: CompetitorsPage;
  label: string;
  lastRanAt: string;
  runCount: number;
  params: unknown;
};

/**
 * Re-applies this project's CURRENT pin/exclude overrides to a restored past
 * run, so a run recorded before a later Exclude or Pin does not silently
 * un-hide (or un-pin) a domain the next time this tab opens.
 *
 * Restoring reads the run's own durable R2 copy (see `AnalysisRunService`'s
 * own doc comment) -- a byte-for-byte snapshot taken at record time that
 * nothing ever rewrites. The mutation hooks in `useCompetitorsQueries.ts`
 * (`patchCachedRestoredCompetitorsRun`) already patch the in-memory TanStack
 * Query cache the moment a pin/exclude succeeds, which is what makes the
 * change visible without a reload -- but that patch lives only in this
 * session's cache. This is what makes the same correction durable ACROSS a
 * reload, by re-deriving it from the standing D1 overrides every time,
 * rather than trusting whatever was true when the run was recorded.
 *
 * `overrides` is the project's full current override list -- a free D1 read
 * (`useProjectCompetitorsQuery`), the same one the hidden-domains manager
 * already fetches. `reapplyProjectCompetitors` is a pure, idempotent view
 * over `CompetitorsService`'s now-pristine stored pages (see that function's
 * own doc comment for the invariant this relies on), so calling it here is
 * safe even when the restored run turns out not to be adopted.
 */
export function reapplyRestoredOverrides(
  restored: RestoredCompetitorsRun | null,
  overrides: ProjectCompetitorRow[],
): RestoredCompetitorsRun | null {
  if (!restored) return null;
  return {
    ...restored,
    result: reapplyProjectCompetitors(restored.result, overrides),
  };
}
