import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import {
  domainOverviewResultSchema,
  type DomainOverviewResult,
} from "@/types/schemas/domain";
import {
  mapPositionBuckets,
  readKeywordCount,
  readTrafficEstimate,
} from "./domainOverviewMapper";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import { getKeywordsPage } from "@/server/features/domain/services/domainKeywordsPage";
import { getPagesPage } from "@/server/features/domain/services/domainPagesPage";
import { getRankHistory } from "@/server/features/domain/services/domainRankHistory";

// Lets a caller attribute spend to its own feature (e.g. onboarding). Applied
// to the DataForSEO call, not the cache key, so cached results are shared
// across callers.
type MeteringOverrides = {
  creditFeature?: CreditFeature;
};

/** Domain overview data is refreshed every 12 hours. */
const DOMAIN_OVERVIEW_TTL_SECONDS = 12 * 60 * 60;

async function getOverview(
  input: {
    projectId: string;
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
  metering: MeteringOverrides = {},
): Promise<DomainOverviewResult> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);

  const cacheKey = await buildCacheKey("domain:overview:v3", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    includeSubdomains: input.includeSubdomains,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  // Records this analysis for the tab's history / auto-restore. Free and best
  // effort: it writes one row pointing at the cache key we just used, so the
  // tab can render this exact result again without a metered fetch.
  const recordRun = () =>
    AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.domainOverview,
      params: {
        domain: input.domain,
        includeSubdomains: input.includeSubdomains,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
      },
      cacheKey,
      label: domain,
    });

  const cachedRaw = await getCached(cacheKey);
  const cached = domainOverviewResultSchema.safeParse(cachedRaw);
  if (cached.success && cached.data.contractVersion === 2) {
    await recordRun();
    return cached.data;
  }

  const nowIso = new Date().toISOString();
  const dataforseo = createDataforseoClient(billingCustomer);

  const metricsResponse = await dataforseo.domain.rankOverview({
    target: domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    ...metering,
  });

  const metrics = metricsResponse[0];

  const organicTraffic = readTrafficEstimate(metrics?.metrics?.organic?.etv);
  const organicKeywords = readKeywordCount(metrics?.metrics?.organic?.count);
  const positionBuckets = mapPositionBuckets(metrics?.metrics?.organic);

  const result: DomainOverviewResult = {
    contractVersion: 2,
    source: "DataForSEO Labs",
    scope: {
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      includeSubdomains: input.includeSubdomains,
    },
    domain,
    organicTraffic,
    organicKeywords,
    backlinks: null,
    referringDomains: null,
    positionBuckets,
    hasData:
      organicKeywords != null ||
      organicTraffic != null ||
      positionBuckets !== null,
    fetchedAt: nowIso,
  };

  if (result.hasData) {
    void setCached(cacheKey, result, DOMAIN_OVERVIEW_TTL_SECONDS).catch(
      (error) => {
        console.error("domain.overview.cache-write failed:", error);
      },
    );
    await recordRun();
  }

  return result;
}

async function getSuggestedKeywords(
  input: {
    domain: string;
    locationCode: number;
    languageCode: string;
    organizationId: string;
    projectId: string;
  },
  billingCustomer: BillingCustomerContext,
  metering: MeteringOverrides = {},
): Promise<
  Array<{
    keyword: string;
    position: number | null;
    searchVolume: number | null;
    traffic: number | null;
    cpc: number | null;
    keywordDifficulty: number | null;
  }>
> {
  const domain = normalizeDomainInput(input.domain, true);

  const cacheKey = await buildCacheKey("domain:keyword-suggestions", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = z
    .array(
      z.object({
        keyword: z.string(),
        position: z.number().nullable(),
        searchVolume: z.number().nullable(),
        traffic: z.number().nullable(),
        cpc: z.number().nullable(),
        keywordDifficulty: z.number().nullable(),
      }),
    )
    .safeParse(cachedRaw);
  if (cached.success && cached.data.length > 0) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);

  const rankedKeywordsResponse = await dataforseo.domain.rankedKeywords({
    target: domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: 100,
    orderBy: ["ranked_serp_element.serp_item.etv,desc"],
    ...metering,
  });

  const keywords = rankedKeywordsResponse.items
    .map((item) => mapKeywordItem(item))
    .filter(
      (item): item is NonNullable<ReturnType<typeof mapKeywordItem>> =>
        item != null,
    )
    .map((item) => ({
      keyword: item.keyword,
      position: item.position,
      searchVolume: item.searchVolume,
      traffic: item.traffic,
      cpc: item.cpc,
      keywordDifficulty: item.keywordDifficulty,
    }));

  if (keywords.length > 0) {
    void setCached(cacheKey, keywords, DOMAIN_OVERVIEW_TTL_SECONDS).catch(
      (error) => {
        console.error("domain.keyword-suggestions.cache-write failed:", error);
      },
    );
  }

  return keywords;
}

export const DomainService = {
  getOverview,
  getSuggestedKeywords,
  getKeywordsPage,
  getPagesPage,
  getRankHistory,
} as const;
