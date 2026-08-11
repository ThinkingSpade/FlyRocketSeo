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
 * nothing ever rewrites, and this function's own correctness DEPENDS on that:
 * `reapplyProjectCompetitors` (which this wraps) can only be called against a
 * page no prior override application has touched (see its own doc comment).
 * `useCompetitorsQueries.ts` used to also patch the raw restored-run cache
 * entry directly (`patchCachedRestoredCompetitorsRun`) the moment a
 * pin/exclude mutation succeeded, on the theory that a session-only patch was
 * harmless because this function re-derives from D1 anyway -- but that patch
 * mutated the EXACT entry this function reads as pristine, so an excluded
 * row was already gone from `restored.result.rows` by the time
 * `reapplyProjectCompetitors` ran, and the hiddenCount it computed came out
 * 0, not 1 (removed once the collision was found).
 *
 * `overrides` is the project's full current override list -- a free D1 read
 * (`useProjectCompetitorsQuery`), the same one the hidden-domains manager
 * already fetches. What now makes a mutation visible on a restored run
 * without a reload is `useSetProjectCompetitorMutation`/
 * `useRemoveProjectCompetitorMutation` writing the server's fresh override
 * list straight into that query's cache (see their own doc comments): this
 * function re-runs on the very next render with the new `overrides`, against
 * a `restored.result` nothing else ever touches.
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
