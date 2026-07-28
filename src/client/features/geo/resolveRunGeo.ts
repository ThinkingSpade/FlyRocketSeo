import { resolveGeo } from "@/shared/geo/resolveGeo";
import { getLanguageCode } from "@/shared/keyword-locations";
import type { GeoNeed, ResolvedGeo, TargetArea } from "@/shared/geo/types";

/**
 * The ResolvedGeo for one metered run -- the single place every Task-6
 * affected tab turns "the header ScopeControl's active area" plus "whatever
 * country this particular run is actually going to" into what `resolveGeo`
 * should be asked.
 *
 * `area` is `TargetAreaScope.area` (`useTargetAreaScope.ts`) -- never null,
 * but a confirmed sub-country area only applies here when its own parent
 * country matches `sessionLocationCode`. Every one of the six tabs keeps a
 * pre-existing, independent country selector predating target areas
 * entirely (SERP Overview, Content Optimizer, Topic Clusters and Keyword
 * Research each still have their own "Location" field; Keyword Trends'
 * worldwide default plays the same role). Applying a Dallas-Ft-Worth metro
 * code while that selector sits on "Canada" would silently blend a metro
 * code into an unrelated country's request -- so a target area whose own
 * country doesn't match the session's is treated as ABSENT for this run,
 * falling back to exactly today's national behaviour for whatever country
 * the tab is actually running against. This is the one reconciliation point
 * between the two controls; every call site funnels through it rather than
 * re-deriving the check inline.
 *
 * This also sidesteps a staleness trap: before any area is confirmed,
 * `TargetAreaScope.area` is `resolveDefaultScopeArea(x)` for whatever `x`
 * was current when the SCOPE hook last resolved it -- not necessarily this
 * run's own `sessionLocationCode`, which the tab's own selector can change
 * independently. Nulling out every `kind: "country"` area unconditionally
 * (rather than trusting its embedded `locationCode`) means a stale default
 * can never leak into the request; `resolveGeo`'s own null-area branch
 * always falls back to the LIVE `sessionLocationCode` passed here instead.
 *
 * Language is always derived from `sessionLocationCode` via the shared
 * country table, matching every one of these tabs' pre-existing behaviour
 * (none of them expose their own language picker) -- `resolveGeo` then
 * overrides it with the area's own country's language when a compatible
 * area applies, exactly as it does for every other caller.
 */
export function resolveRunGeo(
  need: GeoNeed,
  area: TargetArea,
  sessionLocationCode: number,
): ResolvedGeo {
  const applicableArea: TargetArea | null =
    area.kind !== "country" && area.parentCountryCode === sessionLocationCode
      ? area
      : null;
  return resolveGeo(need, applicableArea, {
    locationCode: sessionLocationCode,
    languageCode: getLanguageCode(sessionLocationCode),
  });
}

/**
 * The geo for a PAST result that was not captured through this session's
 * own authorize()-time snapshot -- a restored or auto-restored run, shown
 * from a stored `locationCode`/`languageCode` rather than a live submit.
 *
 * Deliberately does NOT consult the live scope control: a restored run's
 * stored `locationCode` is the only source of truth for what geography it
 * actually describes, and re-applying whatever area happens to be active
 * *now* would reproduce exactly the stale-label failure this whole task
 * exists to prevent (a since-changed scope control silently relabelling
 * data that was never fetched under it). There is also no cached
 * human-readable name for an arbitrary historical sub-country code without
 * a fresh D1 lookup this helper has no access to -- a recognised COUNTRY
 * code gets its real name via `resolveGeo`'s own no-area branch; anything
 * else (a metro/city/region code from a past local run) gets an honestly
 * empty label rather than a fabricated one. `geoMetricSuffix`
 * (`geoMetricLabel.ts`) already renders an empty label as no suffix at all,
 * so this degrades to "no claim" rather than a wrong one.
 */
export function resolveStoredGeo(
  need: GeoNeed,
  storedLocationCode: number,
  storedLanguageCode: string,
): ResolvedGeo {
  return resolveGeo(need, null, {
    locationCode: storedLocationCode,
    languageCode: storedLanguageCode,
  });
}
