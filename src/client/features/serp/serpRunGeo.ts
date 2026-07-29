// This tab's own run-geography bundle: capture, persist-payload, restore, and
// labeling logic, extracted out of SerpOverviewPage.tsx so it lives in a
// `.ts` module Vitest actually collects (the harness only picks up
// `src/**/*.test.ts`, never `.tsx` -- see this repo's own test-layout rule).
// Named `serpRunGeo`, not a case-swap of `SerpOverviewPage.tsx` or
// `SerpOverviewService.ts`: on a case-insensitive filesystem a bare-case-swap
// companion file has previously degraded oxlint's type-aware resolution to
// `any` for the whole module.
import {
  parseStoredGeo,
  resolveRunGeo,
  resolveStoredGeo,
  toStoredMetricGeo,
} from "@/client/features/geo/resolveRunGeo";
import { formatGeoMetricLabel } from "@/client/features/geo/geoMetricLabel";
import { describeGeoRunError } from "@/client/features/geo/geoUnavailableMessage";
import { serpGeoBundleSchema } from "@/types/schemas/serp";
import { STORED_GEO_BUNDLE_VERSION } from "@/types/schemas/geo";
import type { ResolvedGeo, TargetArea } from "@/shared/geo/types";

/** The four geo needs this tab's own numbers can each independently answer --
 *  volume/CPC can go genuinely local (Google Ads), difficulty and domain
 *  analytics stay Labs-only/national regardless (see resolveGeo.ts's
 *  NATIONAL_ONLY set), and the SERP results themselves have their own
 *  provider label. Bundled together because every render path needs all four
 *  at once, and a bundle can't accidentally mix a captured value for one need
 *  with a live one for another. `parentCountryCode` (Defect 1 fix) is the
 *  single session location this WHOLE bundle was captured against -- see
 *  `toStoredMetricGeo`'s own doc comment for why one value covers every
 *  metric here -- carried so the bundle can be persisted for a later
 *  restore. */
export type SerpRunGeo = {
  serp: ResolvedGeo;
  volume: ResolvedGeo;
  difficulty: ResolvedGeo;
  /** Country-only, always -- Defect 2 fix. Sent to the server as the
   *  explicit `domainAnalyticsLocationCode`/`domainAnalyticsLanguageCode`
   *  pair so the Labs domain-traffic enrichment never receives a metro code,
   *  even though `serp`/`volume` above legitimately do for a local run. */
  domainAnalytics: ResolvedGeo;
  parentCountryCode: number;
};

/**
 * Captured once at authorize()-time (form submit / "Run again"), never
 * recomputed from the live scope control afterward -- see resolveRunGeo.ts's
 * own header for why. This is the function that makes "the label describes
 * what was actually fetched" true: every render reads its RETURN VALUE
 * (stashed in SerpOverviewPage's `runGeo` state), not a fresh call against
 * whatever the scope control's live area happens to be during that render.
 */
export function captureSerpRunGeo(
  area: TargetArea,
  sessionLocationCode: number,
): SerpRunGeo {
  return {
    serp: resolveRunGeo("serp", area, sessionLocationCode),
    volume: resolveRunGeo("keyword-volume", area, sessionLocationCode),
    difficulty: resolveRunGeo("keyword-difficulty", area, sessionLocationCode),
    domainAnalytics: resolveRunGeo(
      "domain-analytics",
      area,
      sessionLocationCode,
    ),
    parentCountryCode: sessionLocationCode,
  };
}

/** The wire payload sent alongside a live request purely so the server can
 *  persist it -- this page never reads its own return value back for
 *  anything (see `parseRestoredSerpRunGeo` below for the restore side). */
export function buildSerpGeoPayload(geo: SerpRunGeo) {
  return {
    v: STORED_GEO_BUNDLE_VERSION,
    serp: toStoredMetricGeo(geo.serp, geo.parentCountryCode),
    volume: toStoredMetricGeo(geo.volume, geo.parentCountryCode),
    difficulty: toStoredMetricGeo(geo.difficulty, geo.parentCountryCode),
    domainAnalytics: toStoredMetricGeo(
      geo.domainAnalytics,
      geo.parentCountryCode,
    ),
  } as const;
}

/**
 * For a restored/auto-restored run that never went through this session's
 * own authorize() call -- reads the geo bundle THAT RUN persisted (Defect 1
 * fix), never the live scope control (re-applying today's scope to
 * yesterday's data is the exact stale-label failure this task exists to
 * prevent) and never reconstructed from the bare stored `locationCode`
 * (which, for a local run, is itself a metro code -- see resolveRunGeo.ts's
 * own header on `resolveStoredGeo` for why that used to mislabel a DFW run
 * as an unnamed national one). A run recorded before this bundle existed
 * (or a corrupt one) returns null -- "geography unknown for this run" --
 * which every render already treats the same as no geo at all.
 *
 * `domainAnalytics` is backfilled, not required, when a bundle predates the
 * Defect 2 fix: it depends only on the country code (NATIONAL_ONLY), which
 * every bundle -- old or new -- already carries via `serp.parentCountryCode`,
 * so this is the exact value `captureSerpRunGeo` would have produced for
 * this same historical run, not a guess. Requiring the key outright would
 * instead fail the whole bundle and hide a perfectly valid run's entire
 * restored view over one missing field.
 */
export function parseRestoredSerpRunGeo(params: unknown): SerpRunGeo | null {
  const bundle = parseStoredGeo(serpGeoBundleSchema, params);
  if (!bundle) return null;
  return {
    serp: bundle.serp,
    volume: bundle.volume,
    difficulty: bundle.difficulty,
    domainAnalytics:
      bundle.domainAnalytics ??
      resolveStoredGeo(
        "domain-analytics",
        bundle.serp.parentCountryCode,
        bundle.difficulty.languageCode,
      ),
    parentCountryCode: bundle.serp.parentCountryCode,
  };
}

/** Task 6 Step 4's "a provider rejects the location" case for this tab's
 *  main SERP call: when the run that just failed was scoped LOCAL, say so
 *  specifically instead of showing the tab's bare generic error text. No
 *  geo captured yet (a query can error before any run ever succeeded) falls
 *  back to the plain message unchanged. */
export function describeGeoRunErrorForSerp(
  geo: SerpRunGeo | null,
  fallbackMessage: string,
): string {
  if (!geo) return fallbackMessage;
  return describeGeoRunError("this SERP", geo.serp, fallbackMessage);
}

/**
 * This tab's own geo-metric label, wrapping the shared `formatGeoMetricLabel`
 * with one addition: a "local" scope is qualified as "(unconfirmed)" rather
 * than asserted outright (Codex finding 7).
 *
 * Why: resolveGeo assigns `scope`/`provider` from the SELECTED area alone,
 * before any provider response has established what was actually accepted.
 * scripts/verify-geo-support.ts's own header spells out the assumption this
 * rests on -- that the SERP/Google Ads endpoints honor a metro/DMA
 * `location_code` -- and that spike has never actually been run against the
 * live API. Worse, even a SUCCESSFUL response can't retroactively prove it:
 * the SDK's own response types (e.g.
 * SerpGoogleOrganicLiveAdvancedResultInfo's `location_code`) document that
 * field as "location code in a POST array" -- an echo of what we sent, not
 * independent confirmation of what was actually used to produce results.
 * Only an outright REJECTION is independently observable (the call throws --
 * see describeGeoRunError above); a silent country-wide fallback that still
 * returns 200 is indistinguishable from a genuine local result in this data.
 *
 * A confident "DFW" label on that unverifiable a number is this project's
 * own worst failure mode (a national number wearing a local label), so this
 * tab hedges every "local" label rather than asserting it. National-scope
 * labels (difficulty, domain analytics, or a local one that fell back)
 * pass through unchanged -- they carry no local claim to overstate.
 */
export function formatSerpGeoLabel(
  metricLabel: string,
  geo: Pick<ResolvedGeo, "scope" | "label" | "locationCode">,
): string {
  const base = formatGeoMetricLabel(metricLabel, geo);
  return geo.scope === "local" ? `${base} (unconfirmed)` : base;
}
