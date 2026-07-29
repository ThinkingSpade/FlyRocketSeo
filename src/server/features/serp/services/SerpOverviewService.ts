import { z } from "zod";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/shared/keyword-locations";
import { mapSerpOverview } from "@/server/features/serp/services/serpOverviewMapping";
import { resolveDomainAnalyticsLocation } from "@/server/features/serp/services/serpOverviewGeo";

/** SERPs shift within hours, but overview research doesn't need minute-fresh
 *  data — 6h keeps repeat lookups free without going stale. */
const SERP_OVERVIEW_TTL_SECONDS = 6 * 60 * 60;

// Labs bulk_traffic_estimation item, parsed defensively (external data).
const trafficEstimationItemSchema = z
  .object({
    target: z.string().nullable().optional(),
    metrics: z
      .object({
        organic: z
          .object({ etv: z.number().nullable().optional() })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

import { serpOverviewSchema } from "@/types/schemas/serp";

type SerpOverviewResponse = z.infer<typeof serpOverviewSchema>;

async function getSerpOverview(
  input: {
    projectId: string;
    keyword: string;
    locationCode?: number;
    languageCode?: string;
    /** Country-only geography for the Labs domain-traffic enrichment (Defect
     *  2 fix) -- see serpOverviewGeo.ts's own `resolveDomainAnalyticsLocation`
     *  for the fallback this service applies when either is absent. */
    domainAnalyticsLocationCode?: number;
    domainAnalyticsLanguageCode?: string;
    /** The client's own captured geo bundle (Defect 1 fix) -- opaque here,
     *  forwarded verbatim into `params` purely so a later restore can read
     *  it back; this service never inspects or resolves it itself. */
    geo?: unknown;
  },
  billingCustomer: BillingCustomerContext,
): Promise<SerpOverviewResponse> {
  const keyword = input.keyword.trim().toLowerCase();
  const locationCode = input.locationCode ?? DEFAULT_LOCATION_CODE;
  const languageCode = input.languageCode ?? getLanguageCode(locationCode);
  // Deliberately separate from locationCode/languageCode above: Labs cannot
  // answer at metro level, so its own call below must never receive the same
  // (possibly metro) code the SERP/keyword-stats calls legitimately use.
  const domainAnalyticsGeo = resolveDomainAnalyticsLocation({
    locationCode,
    languageCode,
    domainAnalyticsLocationCode: input.domainAnalyticsLocationCode,
    domainAnalyticsLanguageCode: input.domainAnalyticsLanguageCode,
  });

  // Bumped to v3 (Defect 2/3 fix): a v2 entry's domainEtv values may have
  // been computed by sending Labs the metro code, and it never carries the
  // domainTrafficUnavailable/keywordStatsUnavailable fields the response
  // schema now requires -- folding the new geo pair into the key AND bumping
  // the prefix guarantees no pre-fix entry is ever served as if it were
  // already correct, rather than relying solely on the schema mismatch below.
  const cacheKey = await buildCacheKey("serp:overview:v3", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword,
    locationCode,
    languageCode,
    domainAnalyticsLocationCode: domainAnalyticsGeo.locationCode,
    domainAnalyticsLanguageCode: domainAnalyticsGeo.languageCode,
  });

  const recordRun = () =>
    AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.serpOverview,
      params: { keyword, locationCode, languageCode, geo: input.geo ?? null },
      cacheKey,
      label: keyword,
    });

  const cached = serpOverviewSchema.safeParse(await getCached(cacheKey));
  if (cached.success && cached.data.results.length > 0) {
    await recordRun();
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const items = await dataforseo.serp.live({
    keyword,
    locationCode,
    languageCode,
  });
  const overview = mapSerpOverview(items);

  // The SERP payload has no per-result metrics, so enrich each ranking domain
  // with its estimated monthly organic traffic in one bulk Labs call.
  // Best-effort: an enrichment failure never sinks the overview -- but it
  // must not be swallowed silently either (Defect 3 fix): domainTrafficUnavailable
  // stays false when there was simply nothing to enrich (no ranking domain),
  // and only flips true when the call was actually attempted and threw, so
  // the UI can tell "no data" apart from "couldn't load".
  const etvByDomain = new Map<string, number>();
  let domainTrafficUnavailable = false;
  const domains = [
    ...new Set(
      overview.results
        .map((item) => item.domain)
        .filter((domain): domain is string => Boolean(domain)),
    ),
  ];
  if (domains.length > 0) {
    try {
      const estimates = await dataforseo.competitors.trafficEstimation({
        targets: domains,
        // Defect 2 fix: the country-only pair, never locationCode/languageCode
        // above -- see resolveDomainAnalyticsLocation's own header.
        locationCode: domainAnalyticsGeo.locationCode,
        languageCode: domainAnalyticsGeo.languageCode,
      });
      for (const raw of estimates) {
        const parsed = trafficEstimationItemSchema.safeParse(raw);
        if (!parsed.success) continue;
        const target = parsed.data.target;
        const etv = parsed.data.metrics?.organic?.etv;
        if (target && etv != null) etvByDomain.set(target, etv);
      }
    } catch (error) {
      console.warn("serp:overview traffic enrichment failed:", error);
      domainTrafficUnavailable = true;
    }
  }

  // The keyword's own metrics for the stats header. Routed through the same
  // provider-aware helper Keyword Research's saved-list refresh and Rank
  // Tracking's suggestion step already use (getKeywordDataProvider decides
  // Labs vs Google Ads from `locationCode` alone), rather than an
  // unconditional Labs call: a metro `locationCode` (Task 6's geo
  // activation) now comes back with genuinely local volume/CPC via Google
  // Ads, honestly with no keyword difficulty (Labs-only) instead of either
  // erroring on a location Labs never supported or silently mislabeling a
  // Labs-country-level number as this metro's own. Best-effort — a lookup
  // failure for either provider must not sink the SERP view.
  let keywordStats: SerpOverviewResponse["keywordStats"] = null;
  // Defect 3 fix: true only when this fetch was attempted and threw, never
  // when it simply returned no metric for the keyword.
  let keywordStatsUnavailable = false;
  try {
    const { fetchKeywordMetricsForList } =
      await import("@/server/lib/dataforseo/keyword-metrics");
    const metrics = await fetchKeywordMetricsForList(dataforseo, {
      keywords: [keyword],
      locationCode,
      languageCode,
      creditFeature: "keyword_research",
    });
    const metric = metrics[0];
    if (metric) {
      keywordStats = {
        searchVolume: metric.searchVolume,
        cpc: metric.cpc,
        keywordDifficulty: metric.keywordDifficulty,
      };
    }
  } catch (error) {
    console.warn("serp:overview keyword stats failed:", error);
    keywordStatsUnavailable = true;
  }

  const result: SerpOverviewResponse = {
    keyword,
    locationCode,
    languageCode,
    keywordStats,
    domainTrafficUnavailable,
    keywordStatsUnavailable,
    ...overview,
    results: overview.results.map((item) => ({
      ...item,
      domainEtv:
        item.domain != null ? (etvByDomain.get(item.domain) ?? null) : null,
    })),
    fetchedAt: new Date().toISOString(),
  };

  void setCached(cacheKey, result, SERP_OVERVIEW_TTL_SECONDS).catch((error) => {
    console.error("serp:overview cache-write failed:", error);
  });
  await recordRun();

  return result;
}

export const SerpOverviewService = {
  getSerpOverview,
};
