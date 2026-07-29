/**
 * Pure area resolution for `ScopeControl.tsx`, split out for the same
 * reason `targetAreaBannerViewModel.ts` is: this repo's Vitest collects only
 * `src/**\/*.test.ts` under `environment: "node"`, so logic worth pinning
 * has to live outside the `.tsx` file that renders it.
 *
 * Named distinctly from `ScopeControl.tsx` (not just a case change) for the
 * same reason `targetAreaBannerViewModel.ts`'s own header gives: this
 * project's filesystem is case-insensitive (Windows), and a `.ts`/`.tsx`
 * pair differing only in case in the same directory was observed to resolve
 * ambiguously enough that the importing `.tsx` file's usage silently
 * degraded to `any` under oxlint's type-aware checker.
 */
import type { TargetArea } from "@/shared/geo/types";
import { LOCATION_OPTIONS } from "@/shared/keyword-locations";

/**
 * What `ScopeControl` shows before any target area has ever been confirmed:
 * the project's own configured country, presented as a `TargetArea` of kind
 * "country" -- the exact shape `geoLocationOptions.ts`'s `filterCountryAreas`
 * already builds for the same rows -- so the header control always has
 * something to display, and the picker's own selected-row checkmark still
 * lines up against one of its rows.
 *
 * This is not a new default -- it is what already answers every research
 * query today (the activation plan's own "a project with no target area
 * behaves exactly as it does today"). The control just makes that explicit
 * and gives a one-click path to a metro.
 */
export function resolveDefaultScopeArea(
  countryLocationCode: number,
): TargetArea {
  const option = LOCATION_OPTIONS.find(
    (candidate) => candidate.code === countryLocationCode,
  );
  return {
    kind: "country",
    locationCode: countryLocationCode,
    // Every code `useProjectMarket` can produce is itself a LOCATION_OPTIONS
    // entry (a project's own locationCode is validated against this same
    // table at save time), so a lookup miss here should never actually
    // happen. Degrading to the bare numeric code as its own label keeps a
    // render path from throwing over that miss -- it must never silently
    // swap in a DIFFERENT country's code just because the label lookup
    // failed.
    label: option?.label ?? String(countryLocationCode),
    parentCountryCode: countryLocationCode,
  };
}

/**
 * Whichever area the header control should show right now: the confirmed
 * project target area if one exists, else the country fallback above.
 * Deliberately ignores an unconfirmed PROPOSAL -- a proposal must not change
 * what any tab shows or queries until the user accepts it (`TargetAreaBanner`
 * is the only UI allowed to surface a proposal at all).
 */
export function resolveActiveScopeArea(
  confirmed: TargetArea | null,
  countryLocationCode: number,
): TargetArea {
  return confirmed ?? resolveDefaultScopeArea(countryLocationCode);
}

/**
 * The area a tab's own scope picker should DISPLAY, given the country that
 * tab's run is actually going to.
 *
 * This deliberately repeats `resolveRunGeo`'s own gate -- a sub-country area
 * applies only when its parent country matches the run's country -- because
 * the picker and the request must never disagree. Showing "Dallas-Ft. Worth,
 * TX" while the run silently goes national (because the country control moved
 * to Canada) is precisely the mismatch that made the previous two-control
 * layout unreadable: the header claimed a metro, the form claimed a country,
 * and neither said which one the numbers came from.
 *
 * A `kind: "country"` area is never returned as-is for the same reason
 * `resolveRunGeo` nulls it out unconditionally: it can be a stale default
 * resolved against a country the tab has since moved off, so the country
 * fallback is rebuilt from the LIVE code instead of trusting the embedded one.
 */
export function resolveEffectiveScopeArea(
  area: TargetArea,
  sessionCountryCode: number,
): TargetArea {
  return area.kind !== "country" &&
    area.parentCountryCode === sessionCountryCode
    ? area
    : resolveDefaultScopeArea(sessionCountryCode);
}
