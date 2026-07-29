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
import type { TargetArea, TargetAreaKind } from "@/shared/geo/types";
import { toGeoDisplayName } from "@/shared/geo/geoDisplayName";
import {
  DEFAULT_LOCATION_CODE,
  isSupportedLocationCode,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";
import type { getGeoLocationByCode } from "@/serverFunctions/geo";

/**
 * The `GeoLocationSelect` value for a rank-tracking config's OWN stored
 * `locationCode`, resolvable WITHOUT any server round trip. Every config
 * saved before this module existed -- and any saved since through a plain
 * country pick, still the common case -- is a genuine `LOCATION_OPTIONS`
 * country code, so its label here is always real, never guessed.
 *
 * A code that ISN'T in `LOCATION_OPTIONS` can only reach here from a config
 * created (or edited) through this modal's own picker after it started
 * accepting metro/city defaults (see `resolveInitialConfigArea` below). This
 * function stays synchronous and D1-free on purpose -- it is also the very
 * first render's placeholder while the async by-code lookup below is still
 * in flight -- so a non-country code falls back to the bare stored number
 * rather than a fabricated name. `RankTrackingConfigModal.tsx` immediately
 * resolves the real name on top of this via `resolveLookedUpConfigArea`
 * (the free `GeoLocationRepository.getByCode` read added for the detection
 * cascade); this placeholder is never the final answer for that case.
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

/** Whether a stored code needs the async by-code lookup at all -- a plain
 *  `LOCATION_OPTIONS` country code (the common case) already has a real name
 *  with no D1 read required, matching `resolveStoredConfigArea`'s own
 *  country branch above. Centralised here so the modal doesn't re-derive
 *  the same "is this a recognised country" check a second way. */
export function needsGeoCodeLookup(locationCode: number): boolean {
  return !isSupportedLocationCode(locationCode);
}

/** The exact row shape `getGeoLocationByCode` resolves to -- read
 *  structurally off the server function itself (same pattern
 *  `GeoSearchResult` in geoLocationOptions.ts already uses for its sibling
 *  `searchGeoLocations`), so this can't silently drift from what
 *  `GeoLocationRepository.getByCode` actually returns. Null covers a code
 *  `geo_locations` genuinely has no row for. Not exported: callers
 *  (`useConfigAreaLookup.ts`, this file's own test) read it structurally off
 *  `resolveLookedUpConfigArea`'s parameter position rather than importing
 *  the type directly -- knip flags an unused export otherwise, same
 *  reasoning `useKeywordResearchController.ts`'s own private geo-bundle
 *  type gives. */
type GeoLocationByCodeResult = Awaited<ReturnType<typeof getGeoLocationByCode>>;

/**
 * `geo_locations` seeds several Google geotarget types (City, DMA Region,
 * County, Postal Code, ...), but this app's own picker only ever WRITES a
 * config's `locationCode` from two of them -- DMA Region (metros) and City
 * (geoLocationOptions.ts's own `buildMetroAreasFromSearch`/`buildCityAreas`)
 * -- or from the bundled US-states table, which `getByCode` cannot resolve at
 * all (see this file's own module comment: states never reach D1). Anything
 * else this D1 read could still turn up (a County/Postal Code row seeded for
 * a different feature) is a real sub-country place without a dedicated
 * picker group, so it falls into the same generic "region" bucket
 * `filterStateAreas` already uses for bundled states, rather than a
 * fabricated third bucket.
 */
function kindForGeoType(type: string): TargetAreaKind {
  if (type === "DMA Region") return "metro";
  if (type === "City") return "city";
  return "region";
}

/** Shown when the free by-code lookup comes back with nothing -- either the
 *  read itself failed, or the stored code genuinely has no `geo_locations`
 *  row (e.g. a bundled US-state code, which that table never seeds). Never
 *  a bare number standing in for a name, and never a guess. */
export const UNRECOGNISED_GEO_CODE_LABEL = "Unrecognised location";

/**
 * Replaces `resolveStoredConfigArea`'s honest-but-unhelpful bare-code
 * placeholder with this config's REAL stored name, once the free D1
 * by-code read resolves. `row` is null for two situations this function
 * deliberately treats the same way (see `UNRECOGNISED_GEO_CODE_LABEL`'s own
 * comment): the lookup failed, or the code has no row at all. Either way,
 * saying "unrecognised" plainly is the honest move -- never re-showing the
 * bare code as if it meant something to the viewer, and never inventing a
 * name the table doesn't actually have.
 */
export function resolveLookedUpConfigArea(
  locationCode: number,
  row: GeoLocationByCodeResult,
): TargetArea {
  if (!row) {
    return {
      kind: "city",
      locationCode,
      label: UNRECOGNISED_GEO_CODE_LABEL,
      parentCountryCode: locationCode,
    };
  }
  return {
    kind: kindForGeoType(row.type),
    locationCode: row.code,
    label: toGeoDisplayName(row.name, row.type),
    parentCountryCode: row.countryCode,
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
