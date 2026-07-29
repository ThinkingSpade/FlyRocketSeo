/**
 * What RankTrackingDetailHeader's own location caption should show, given a
 * config's stored `locationCode` and whatever `TargetArea` `useConfigAreaLookup`
 * currently holds resolved for it.
 *
 * Before this branch, a rank-tracking config's `locationCode` could only ever
 * be a plain LOCATION_OPTIONS country code -- RankTrackingConfigModal's
 * location field was LocationSelect, country-only -- so the header's old
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
 * PREVIOUSLY viewed metro config could otherwise survive into a render for a
 * different config the header didn't remount for (e.g. browser back/forward
 * between two `$configId` routes). A mismatch re-derives the same honest
 * placeholder `resolveStoredConfigArea` already uses as its own
 * pre-resolution state, never the stale name.
 */
import { LOCATIONS } from "@/shared/keyword-locations";
import type { TargetArea } from "@/shared/geo/types";
import { resolveStoredConfigArea } from "./rankTrackingConfigArea";

export function resolveRankTrackingLocationLabel(
  locationCode: number,
  resolvedArea: TargetArea,
): string {
  const shortCountryLabel = LOCATIONS[locationCode];
  if (shortCountryLabel !== undefined) return shortCountryLabel;
  if (resolvedArea.locationCode === locationCode) return resolvedArea.label;
  return resolveStoredConfigArea(locationCode).label;
}
