import { LOCATION_OPTIONS } from "@/shared/keyword-locations";
import type { ResolvedGeo } from "@/shared/geo/types";

/**
 * The muted "· DFW" / "· US" suffix for one metric -- literally the design
 * spec's own examples ("Volume · DFW", "Difficulty · US"). Takes the geo
 * CAPTURED for the metric that actually produced the number (see
 * `resolveRunGeo.ts` -- never the live scope control), so the same table row
 * can show two different suffixes for volume vs. difficulty when a metro's
 * volume is genuinely local but its difficulty fell back to national.
 *
 * Local scope shows the area's own label (already a short, readable name --
 * see `geoDisplayName.ts`). National scope prefers the country's short code
 * (e.g. "US") over its full name ("United States"): the design spec's own
 * example is "Difficulty · US", and `LOCATION_OPTIONS` already carries that
 * abbreviation for every code this can resolve to.
 */
export function geoMetricSuffix(
  geo: Pick<ResolvedGeo, "scope" | "label" | "locationCode">,
): string {
  if (geo.scope === "local") return geo.label;
  const short = LOCATION_OPTIONS.find(
    (option) => option.code === geo.locationCode,
  )?.shortLabel;
  return short ?? geo.label;
}

/**
 * "Volume · DFW" -- the full metric label, muted-suffix style, for direct
 * use as a table header or tile label. Falls back to the bare metric label
 * when there is nothing truthful to append (an empty geo label -- e.g. an
 * unrecognised session country, per `resolveGeo.ts`'s own `?? ""` fallback)
 * rather than rendering a dangling "· ".
 */
export function formatGeoMetricLabel(
  metricLabel: string,
  geo: Pick<ResolvedGeo, "scope" | "label" | "locationCode">,
): string {
  const suffix = geoMetricSuffix(geo);
  return suffix ? `${metricLabel} · ${suffix}` : metricLabel;
}
