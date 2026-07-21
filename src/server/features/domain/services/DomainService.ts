import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
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

const positionBucketsSchema = z.object({
  top3: z.number(),
  pos4to10: z.number(),
  pos11to20: z.number(),
  pos21to50: z.number(),
  pos51plus: z.number(),
});

const domainOverviewResultSchema = z.object({
  domain: z.string(),
  organicTraffic: z.number().nullable(),
  organicKeywords: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  /** Ranking-position distribution (Ahrefs-style buckets); null when Labs has
   *  no per-position breakdown for the domain. */
  positionBuckets: positionBucketsSchema.nullable(),
  hasData: z.boolean(),
  fetchedAt: z.string(),
});

// Per-position fields on the Labs rank-overview payload, read defensively.
const organicPositionsSchema = z
  .object({
    pos_1: z.number().nullable().optional(),
    pos_2_3: z.number().nullable().optional(),
    pos_4_10: z.number().nullable().optional(),
    pos_11_20: z.number().nullable().optional(),
    pos_21_30: z.number().nullable().optional(),
    pos_31_40: z.number().nullable().optional(),
    pos_41_50: z.number().nullable().optional(),
    pos_51_60: z.number().nullable().optional(),
    pos_61_70: z.number().nullable().optional(),
    pos_71_80: z.number().nullable().optional(),
    pos_81_90: z.number().nullable().optional(),
    pos_91_100: z.number().nullable().optional(),
  })
  .passthrough();

const sum = (...values: Array<number | null | undefined>) =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

function mapPositionBuckets(
  organic: unknown,
): z.infer<typeof positionBucketsSchema> | null {
  const parsed = organicPositionsSchema.safeParse(organic ?? {});
  if (!parsed.success) return null;
  const p = parsed.data;
  const buckets = {
    top3: sum(p.pos_1, p.pos_2_3),
    pos4to10: sum(p.pos_4_10),
    pos11to20: sum(p.pos_11_20),
    pos21to50: sum(p.pos_21_30, p.pos_31_40, p.pos_41_50),
    pos51plus: sum(
      p.pos_51_60,
      p.pos_61_70,
      p.pos_71_80,
      p.pos_81_90,
      p.pos_91_100,
    ),
  };
  const total =
    buckets.top3 +
    buckets.pos4to10 +
    buckets.pos11to20 +
    buckets.pos21to50 +
    buckets.pos51plus;
  return total > 0 ? buckets : null;
}

type DomainOverviewResult = z.infer<typeof domainOverviewResultSchema>;

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

  const cacheKey = await buildCacheKey("domain:overview:v2", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    includeSubdomains: input.includeSubdomains,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = domainOverviewResultSchema.safeParse(cachedRaw);
  if (cached.success && cached.data.hasData) {
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

  const organicTraffic =
    metrics?.metrics?.organic?.etv != null
      ? Math.round(metrics.metrics.organic.etv)
      : null;
  const organicKeywords =
    metrics?.metrics?.organic?.count != null
      ? Math.round(metrics.metrics.organic.count)
      : null;

  const result: DomainOverviewResult = {
    domain,
    organicTraffic,
    organicKeywords,
    backlinks: null,
    referringDomains: null,
    positionBuckets: mapPositionBuckets(metrics?.metrics?.organic),
    hasData: organicKeywords != null && organicKeywords > 0,
    fetchedAt: nowIso,
  };

  if (result.hasData) {
    void setCached(cacheKey, result, DOMAIN_OVERVIEW_TTL_SECONDS).catch(
      (error) => {
        console.error("domain.overview.cache-write failed:", error);
      },
    );
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
