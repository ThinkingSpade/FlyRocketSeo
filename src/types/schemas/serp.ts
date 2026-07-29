import { z } from "zod";
import { STORED_GEO_BUNDLE_VERSION, storedMetricGeoSchema } from "./geo";

/** The four geographies one SERP Overview run captures (see
 *  serpRunGeo.ts's own `SerpRunGeo`) -- sent purely so the server can
 *  persist it in this run's `paramsJson`; a restore reads it back directly
 *  instead of reconstructing it from the bare `locationCode` below.
 *
 *  `domainAnalytics` is OPTIONAL, unlike its three siblings: a bundle
 *  recorded before the Defect 2 fix never captured it, and requiring it
 *  outright would make every one of those otherwise-valid historical runs
 *  fail this schema and lose their whole restored view (parseStoredGeo's own
 *  "no bundle at all" fallback), not just their domain-traffic label. Since
 *  domain-analytics is country-only (resolveGeo's NATIONAL_ONLY set), it
 *  depends only on the country code every bundle already carries via
 *  `serp.parentCountryCode` -- so serpRunGeo.ts's own
 *  `parseRestoredSerpRunGeo` backfills it exactly (not a guess) when absent,
 *  rather than requiring it here. */
export const serpGeoBundleSchema = z.object({
  v: z.literal(STORED_GEO_BUNDLE_VERSION),
  serp: storedMetricGeoSchema,
  volume: storedMetricGeoSchema,
  difficulty: storedMetricGeoSchema,
  domainAnalytics: storedMetricGeoSchema.optional(),
});

export const serpOverviewRequestSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().trim().min(1).max(200),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
  /** Country-only geography for the Labs domain-traffic enrichment (Defect 2
   *  fix) -- see serpOverviewGeo.ts's own `resolveDomainAnalyticsLocation`.
   *  Optional for the same reason `geo` below is: an older caller (the MCP
   *  tool, ContentBriefService) or a run captured with no confirmed target
   *  area sends nothing, and the service falls back to
   *  `locationCode`/`languageCode` directly -- which, for exactly those
   *  callers, is already the plain country code, so the fallback reproduces
   *  today's behaviour rather than changing it. */
  domainAnalyticsLocationCode: z.number().int().positive().optional(),
  domainAnalyticsLanguageCode: z.string().min(2).max(8).optional(),
  /** Optional: older callers (the MCP tool) and callers with no confirmed
   *  target area send nothing, and this run's history simply carries no geo
   *  bundle -- see resolveRunGeo.ts's own header for why that must degrade
   *  to "geography unknown", never an assumed national fallback. */
  geo: serpGeoBundleSchema.optional(),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/serp                    */
/* ------------------------------------------------------------------ */

export const serpSearchSchema = z.object({
  q: z.string().optional(),
  loc: z.number().int().positive().optional(),
});

const serpOverviewResultSchema = z.object({
  rank: z.number().nullable(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  domain: z.string().nullable(),
  description: z.string().nullable(),
  etv: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  previousRank: z.number().nullable(),
  isNew: z.boolean(),
  isUp: z.boolean(),
  isDown: z.boolean(),
  /** Estimated monthly organic traffic for the result's whole domain (Labs
   *  bulk_traffic_estimation) — the plain SERP payload carries no metrics. */
  domainEtv: z.number().nullable(),
});

const keywordStatsSchema = z.object({
  searchVolume: z.number().nullable(),
  keywordDifficulty: z.number().nullable(),
  cpc: z.number().nullable(),
});

/** The SERP overview exactly as it is cached — shared so auto-restore
 *  validates against the same definition that wrote it. */
export const serpOverviewSchema = z.object({
  keyword: z.string(),
  locationCode: z.number(),
  languageCode: z.string(),
  /** The keyword's own metrics (Labs overview); null when Labs has no data. */
  keywordStats: keywordStatsSchema.nullable(),
  results: z.array(serpOverviewResultSchema),
  paaQuestions: z.array(z.string()),
  serpFeatures: z.array(z.object({ type: z.string(), count: z.number() })),
  totalOrganic: z.number(),
  fetchedAt: z.string(),
  /** True only when THIS run's own Labs domain-traffic enrichment was
   *  attempted and threw (Defect 3 fix) -- never when there was simply
   *  nothing to enrich (no ranking domain) or a domain's own etv came back
   *  null. Required (not optional) so a run cached/recorded before this
   *  fix -- whose domainEtv values may have been computed against the wrong,
   *  metro-sent Labs call -- fails this schema and is refetched rather than
   *  served as if it were already correct. */
  domainTrafficUnavailable: z.boolean(),
  /** Same idea for the Google Ads/Labs keyword-stat lookup (Defect 3 fix):
   *  true only when that fetch was attempted and threw. */
  keywordStatsUnavailable: z.boolean(),
});
