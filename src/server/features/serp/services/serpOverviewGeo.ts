// Pure geography-selection logic for the Labs domain-traffic enrichment,
// split out so it's unit-testable without the DataForSEO client's
// `cloudflare:workers` env dependency (same reasoning as
// serpOverviewMapping.ts's own header).

/**
 * Which locationCode/languageCode the Labs bulk_traffic_estimation call
 * should use for "Domain traffic" (Defect 2 fix).
 *
 * Labs is country-only, but the run's plain `locationCode` is a metro/DMA
 * code whenever a local target area is active -- sending that straight to
 * Labs is exactly the bug this function exists to prevent. The client
 * resolves the correct country-level pair once, via resolveGeo's own
 * NATIONAL_ONLY branch (see captureSerpRunGeo in
 * src/client/features/serp/serpRunGeo.ts), and sends it explicitly as
 * `domainAnalyticsLocationCode`/`domainAnalyticsLanguageCode`; this function
 * just prefers it when present.
 *
 * Falling back to the run's plain `locationCode`/`languageCode` when the new
 * fields are absent is deliberately a no-op for those callers, not a
 * regression: an older caller (the MCP tool, ContentBriefService) or a run
 * captured with no confirmed target area never had a local target area in
 * play, so `locationCode` there IS already the country code (resolveGeo's
 * own final fallback branch resolves the same value) -- this degrades to
 * exactly today's pre-fix request, which is what this task's own "a run with
 * no confirmed area must behave EXACTLY as before this branch" requires.
 */
export function resolveDomainAnalyticsLocation(input: {
  locationCode: number;
  languageCode: string;
  domainAnalyticsLocationCode?: number;
  domainAnalyticsLanguageCode?: string;
}): { locationCode: number; languageCode: string } {
  return {
    locationCode: input.domainAnalyticsLocationCode ?? input.locationCode,
    languageCode: input.domainAnalyticsLanguageCode ?? input.languageCode,
  };
}
