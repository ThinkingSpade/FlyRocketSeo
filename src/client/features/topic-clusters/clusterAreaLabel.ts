import type { TargetArea } from "@/shared/geo/types";

/**
 * Topic Clusters' confirmed-target-area mismatch banner (Defect 2 fix):
 * captured ONCE at authorize()-time from the live ScopeControl, then
 * persisted so a later restore reads the SAME value the run actually had --
 * never today's live scope. TopicClustersPage.tsx used to pass
 * `targetAreaScope.area.label` straight into an already-rendered plan on
 * every render, so switching the header control after a plan loaded
 * instantly relabelled it as describing a DIFFERENT city than the one it
 * was actually planned for (see resolveRunGeo.ts's own header for why a
 * metered tab's label must never be recomputed from current control
 * state).
 *
 * This is never about relabeling the plan's own NUMBERS -- Topic Clusters'
 * keyword-idea source (Labs `keyword_suggestions`) has no metro-capable
 * equivalent at all, so those are always national (see `clusterGeoSuffix`
 * in ClusterPlan.tsx, which reads the plan's own stored locationCode
 * instead). This module only decides whether to show the "these numbers
 * don't reflect your confirmed metro" caveat, which itself must describe
 * whatever metro was confirmed AT THAT RUN, not whatever is confirmed now.
 */

/** What `ClusterPlan`'s own `confirmedAreaLabel` prop should say for THIS
 *  run, given the scope state visible at the moment it was authorized --
 *  null when nothing sub-country was confirmed (a plain country is not a
 *  mismatch, so there is nothing to caveat). */
export function captureClusterAreaLabel(
  hasConfirmedArea: boolean,
  area: TargetArea,
): string | null {
  return hasConfirmedArea && area.kind !== "country" ? area.label : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads a restored run's OWN captured value back out of its `paramsJson`.
 * Absent or malformed (a run recorded before this field existed, or a
 * corrupt row) degrades to null -- "nothing confirmed to caveat" -- never a
 * guess pulled from today's live scope control.
 */
export function extractStoredConfirmedAreaLabel(
  params: unknown,
): string | null {
  if (!isRecord(params)) return null;
  const value = params.confirmedAreaLabel;
  return typeof value === "string" ? value : null;
}
