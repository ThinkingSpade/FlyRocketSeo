/**
 * What a rank-tracking location caption should show, given a config's stored
 * `locationCode` and whatever `TargetArea` `useConfigAreaLookup` currently
 * holds resolved for it. Three surfaces render this same caption off the same
 * kind of stored code, by two routes that must agree:
 * RankTrackingDetailHeader and KeywordTrendModal each label ONE config and go
 * through `useRankTrackingLocationLabel` (this function); RankTrackingDomainList
 * labels a whole unpaginated list and goes through
 * `resolveRankTrackingLocationLabels` at the bottom of this file, which
 * resolves every row from ONE batched read instead of one read per row.
 *
 * Before this branch, a rank-tracking config's `locationCode` could only ever
 * be a plain LOCATION_OPTIONS country code -- RankTrackingConfigModal's
 * location field was LocationSelect, country-only -- so the old
 * `LOCATIONS[code] ?? "US"` was always correct: the lookup could only miss on
 * a genuinely garbage code, and "US" was a safe universal default. Commit
 * a7ac8b3 upgraded that modal to GeoLocationSelect and now defaults brand-new
 * configs from the project's own confirmed target area, so a config's
 * `locationCode` can now be a metro or city DMA/City code that ISN'T in
 * LOCATION_OPTIONS at all -- on THOSE configs the old fallback silently
 * claimed "US" for a tracker that was never tracking the whole country: the
 * wrong-label class of bug, worse than an honest placeholder, because it
 * states a geography the tracker does not have.
 *
 * Country configs (the overwhelming majority, and every config saved before
 * this branch) resolve via the SAME `LOCATIONS` short-code map the header
 * always used -- unchanged text, unchanged behaviour, no regression. Only a
 * code that map doesn't recognise falls through to the free `geo_locations`
 * by-code resolution already built for the config modal's own redisplay
 * problem (`useConfigAreaLookup` / `resolveLookedUpConfigArea`), rather than
 * a second, parallel lookup mechanism.
 *
 * `resolvedArea` is trusted only when it actually describes THIS
 * `locationCode`. `useConfigAreaLookup`'s effect does nothing when a config
 * whose code needs no lookup replaces one that did (see that hook's own
 * early-return for `!needsLookup`), so a stale resolution left over from a
 * PREVIOUSLY viewed metro config could otherwise survive into a render the
 * component didn't remount for -- browser back/forward between two
 * `$configId` routes, or a filtered/reordered DomainRow reused for a
 * different domain. A mismatch re-derives the same honest placeholder
 * `resolveStoredConfigArea` already uses as its own pre-resolution state,
 * never the stale name.
 */
import { LOCATIONS } from "@/shared/keyword-locations";
import type { TargetArea } from "@/shared/geo/types";
import type { getGeoLocationsByCodes } from "@/serverFunctions/geo";
import {
  needsGeoCodeLookup,
  resolveLookedUpConfigArea,
  resolveStoredConfigArea,
} from "./rankTrackingConfigArea";

export function resolveRankTrackingLocationLabel(
  locationCode: number,
  resolvedArea: TargetArea,
): string {
  const shortCountryLabel = LOCATIONS[locationCode];
  if (shortCountryLabel !== undefined) return shortCountryLabel;
  if (resolvedArea.locationCode === locationCode) return resolvedArea.label;
  return resolveStoredConfigArea(locationCode).label;
}

/** The rows `getGeoLocationsByCodes` resolves to, read structurally off the
 *  server function itself for the same reason `GeoLocationByCodeResult` in
 *  rankTrackingConfigArea.ts is -- so this cannot drift from what
 *  `GeoLocationRepository.getByCodes` actually returns. */
type GeoRowsByCodeResult = Awaited<ReturnType<typeof getGeoLocationsByCodes>>;

/**
 * The distinct codes in a list of configs that actually cost a D1 read --
 * everything already named by the country-only `LOCATIONS` map is dropped,
 * and repeats collapse, so a project whose twelve trackers all sit in
 * Dallas-Ft. Worth asks about one code, and an all-country project asks about
 * none (and `getByCodes` short-circuits an empty list without touching D1).
 *
 * Sorted, because this doubles as a React Query key. React Query hashes a key
 * array by CONTENT, so an unsorted result would still hit the same cache entry
 * for the same list -- but the same set of configs arriving in a different
 * order (a re-sorted summaries response, a row archived and restored) would
 * hash differently and refetch a read that is already cached. Sorting makes
 * the key depend on the SET of codes, which is all the query actually
 * varies on.
 */
export function locationCodesNeedingLookup(
  locationCodes: readonly number[],
): number[] {
  return [...new Set(locationCodes.filter(needsGeoCodeLookup))].toSorted(
    (a, b) => a - b,
  );
}

/**
 * Labels for a whole list at once, the batch counterpart of
 * `resolveRankTrackingLocationLabel` above -- `RankTrackingDomainList` resolves
 * every row through one query rather than one per row (see
 * `getGeoLocationsByCodes`).
 *
 * `rows` is `undefined` while that single query is still in flight, which is
 * exactly the state the per-row placeholder describes: a country code is
 * already final, and a local code shows `resolveStoredConfigArea`'s honest
 * bare-code placeholder until the rows land. Once they have, a code with no
 * row among them is `UNRECOGNISED_GEO_CODE_LABEL` -- the same treatment
 * `resolveLookedUpConfigArea` gives a confirmed-absent single read, never a
 * fabricated name and never a silent country substitution.
 */
export function resolveRankTrackingLocationLabels(
  locationCodes: readonly number[],
  rows: GeoRowsByCodeResult | undefined,
): Map<number, string> {
  const byCode = new Map(rows?.map((row) => [row.code, row]) ?? []);
  const labels = new Map<number, string>();
  for (const code of locationCodes) {
    const shortCountryLabel = LOCATIONS[code];
    if (shortCountryLabel !== undefined) {
      labels.set(code, shortCountryLabel);
    } else if (rows === undefined) {
      labels.set(code, resolveStoredConfigArea(code).label);
    } else {
      labels.set(
        code,
        resolveLookedUpConfigArea(code, byCode.get(code) ?? null).label,
      );
    }
  }
  return labels;
}
