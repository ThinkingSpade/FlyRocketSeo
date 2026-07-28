/**
 * What `RankTrackingConfigModal`'s own location picker should show and
 * submit -- split out (rather than left inline in that `.tsx` file) for the
 * same reason `resolveScopeArea.ts` is: this repo's Vitest collects only
 * `src/**\/*.test.ts` under `environment: "node"`, so logic worth pinning has
 * to live outside the component that renders it.
 *
 * Exists to close a real gap: the Rank Tracking header's `ScopeControl` reads
 * and writes the project's confirmed target area (same as the other five
 * scoped tabs), but until now nothing about the config-creation modal ever
 * consulted it -- a user could pick "Dallas-Ft. Worth" next to the heading,
 * then create a tracker that silently defaulted to national US anyway. This
 * module is what makes that control genuinely affect something for new
 * configs, without ever touching an EXISTING one's stored `locationCode`
 * (editing a tracker must keep labelling it from its own configuration, never
 * from wherever the project's live scope has since moved on to -- see
 * `resolveInitialConfigArea`'s own doc comment).
 */
import type { TargetArea } from "@/shared/geo/types";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";

/**
 * The `GeoLocationSelect` value for a rank-tracking config's OWN stored
 * `locationCode`. Every config saved before this module existed -- and any
 * saved since through a plain country pick, still the common case -- is a
 * genuine `LOCATION_OPTIONS` country code, so its label here is always real,
 * never guessed.
 *
 * A code that ISN'T in `LOCATION_OPTIONS` can only reach here from a config
 * created (or edited) through this modal's own picker after it started
 * accepting metro/city defaults (see `resolveInitialConfigArea` below).
 * There is no free, client-callable lookup today that turns an arbitrary
 * `geo_locations` code back into its name -- only the prefix-TEXT
 * `searchGeoLocations` exists (keyed by name, not by code; see that server
 * function's own doc comment) -- so resolving a real label here would mean
 * adding a new server round trip just to redisplay a value the user already
 * chose. Falling back to the bare code keeps this HONEST -- never a
 * fabricated name -- at the cost of polish for that one edge case.
 */
export function resolveStoredConfigArea(locationCode: number): TargetArea {
  const option = LOCATION_OPTIONS.find(
    (candidate) => candidate.code === locationCode,
  );
  if (option) {
    return {
      kind: "country",
      locationCode: option.code,
      label: option.label,
      parentCountryCode: option.code,
    };
  }
  return {
    kind: "city",
    locationCode,
    label: `Location #${locationCode}`,
    parentCountryCode: locationCode,
  };
}

/**
 * The initial `GeoLocationSelect` value the config modal opens with.
 *
 * An EXISTING config's own stored location always wins, whatever the
 * project's live target-area scope has since moved on to -- an existing
 * tracker created against US must keep saying US, exactly like every other
 * historical figure in this app is labelled from its own stored
 * configuration rather than relabelled by a since-changed live control.
 *
 * Only a brand-new config (no `existingLocationCode`) takes `defaultArea` --
 * the project's own confirmed scope, whatever grain it is (metro, city, or
 * the plain country fallback `resolveActiveScopeArea` returns when nothing
 * is confirmed yet). `defaultArea` itself being absent (the caller couldn't
 * resolve one) falls back to exactly today's hardcoded national default, so
 * this never regresses a project with no confirmed area.
 */
export function resolveInitialConfigArea(input: {
  existingLocationCode: number | null;
  defaultArea: TargetArea | null;
}): TargetArea {
  if (input.existingLocationCode !== null) {
    return resolveStoredConfigArea(input.existingLocationCode);
  }
  return input.defaultArea ?? resolveStoredConfigArea(DEFAULT_LOCATION_CODE);
}
