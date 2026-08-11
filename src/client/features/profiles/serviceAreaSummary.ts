import { primaryAreaOf } from "./profilePrefill";
import type { TargetAreaResult } from "@/server/features/geo/services/TargetAreaService";

/**
 * What the "Where do they sell?" block should say about the actual place.
 *
 * The select above it records a SHAPE (`serviceAreaKind`), which is all
 * `project_profiles` stores and all that decides whether generated seeds
 * carry a geo modifier. The place that shape refers to lives in
 * `project_target_areas` and was invisible from this card, so the one control
 * whose answer depends on a city never named one.
 *
 * This reads that table's own result; it does not copy the geography onto the
 * profile. Two stores for one fact would drift, which is exactly what the
 * `project_profiles` schema comment says to avoid.
 */

// Not exported: both consumers read fields off the returned value rather
// than naming the type, the same way resolveGbpCapabilityState's own union
// stays local to its file.
type ServiceAreaSummary = {
  /**
   * "proposed" is a detected guess nobody has accepted. Kept distinct from
   * "confirmed" so the field can avoid presenting a guess with the same
   * confidence as an answer the user actually gave.
   */
  state: "confirmed" | "proposed" | "none";
  label: string | null;
  /** Other places the detection named, when it found several. */
  alternatives: string[];
};

const NOTHING: ServiceAreaSummary = {
  state: "none",
  label: null,
  alternatives: [],
};

export function summariseServiceArea(
  result: TargetAreaResult | null | undefined,
): ServiceAreaSummary {
  const primary = primaryAreaOf(result);
  // `undefined` (the query has not resolved) and `null` (nothing detected)
  // are both "we have no place to name", and neither may render as a claim.
  if (!result || !primary) return NOTHING;

  const alternatives =
    !result.confirmed && result.proposal.multi
      ? result.proposal.areas
          .filter((area) => area.locationCode !== primary.locationCode)
          .map((area) => area.label)
      : [];

  return {
    state: result.confirmed ? "confirmed" : "proposed",
    label: primary.label,
    alternatives,
  };
}
