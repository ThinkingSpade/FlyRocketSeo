import type { ResolvedGeo } from "@/shared/geo/types";

/**
 * Honest-degradation copy for Task 6 Step 4. Two distinct situations, both
 * required by the activation plan's own test list, and neither may be
 * papered over with a silently-wrong number:
 *
 *  - `describeGeoUnavailable`: `resolveGeo` already KNOWS, before any
 *    network call, that this figure cannot be produced at all
 *    (`provider: "none"`) -- the resolved country has no Labs coverage, so
 *    there is no national fallback either (see `resolveGeo.ts`'s own
 *    NATIONAL_ONLY branch). This is not a metro-specific message -- it names
 *    the actual country, because that is what genuinely lacks coverage,
 *    whether or not a metro happens to be active.
 *
 *  - `describeGeoRunError`: a metered call was ATTEMPTED and failed while a
 *    LOCAL scope was in play. The spec's step-1 provider spike was never
 *    run (see the plan's own "one assumption still unverified" section), so
 *    a provider rejecting a metro is a live possibility, not a hypothetical
 *    -- this must say so specifically rather than showing the tab's generic
 *    error copy, which says nothing about geography at all. It never claims
 *    a fallback happened; no other code path here silently re-fetches at a
 *    different scope (see resolveRunGeo.ts's own header: an automatic retry
 *    at a different scope would itself be an uncommanded second paid run).
 */
export function describeGeoUnavailable(
  metricLabel: string,
  geo: Pick<ResolvedGeo, "provider" | "label">,
): string | null {
  if (geo.provider !== "none") return null;
  return `${metricLabel} isn't available for ${geo.label} -- showing nothing rather than a guessed number.`;
}

export function describeGeoRunError(
  metricLabel: string,
  geo: Pick<ResolvedGeo, "scope" | "label">,
  fallbackMessage: string,
): string {
  if (geo.scope !== "local") return fallbackMessage;
  return `Couldn't load ${metricLabel} for ${geo.label} -- this location may not be supported yet. ${fallbackMessage}`;
}

/**
 * A third honest-degradation case, distinct from the two above: the OVERALL
 * request succeeded, but one specific per-metric enrichment inside it was
 * attempted and failed (e.g. SERP Overview's Labs domain-traffic call, or its
 * Google Ads/Labs keyword-stat call -- see SerpOverviewService.ts). Unlike
 * `describeGeoUnavailable`, this isn't a pre-flight "no provider covers this
 * geography" prediction -- a network call genuinely ran and threw. Unlike
 * `describeGeoRunError`, the whole run didn't fail, so the tab's generic
 * error alert never fires; without this, that specific figure would just
 * render as a bare "--" with no way to tell "no data" apart from "couldn't
 * load". Names both the metric and its geography for the same reason its
 * siblings do: a bare "couldn't load" leaves the user unable to tell whether
 * a different location would even help.
 */
export function describeGeoFetchFailure(
  metricLabel: string,
  geo: Pick<ResolvedGeo, "label">,
): string {
  return `${metricLabel} couldn't be loaded for ${geo.label} this run -- showing nothing rather than a guessed number.`;
}
