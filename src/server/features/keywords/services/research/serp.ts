import { type SerpLiveItem } from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { SerpResultItem } from "@/types/keywords";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeKeyword } from "./helpers";
import { AppError } from "@/server/lib/errors";
import {
  safeSerpCount,
  safeSerpEstimate,
  safeSerpPosition,
} from "@/server/features/serp/services/serpOverviewMapping";

const SERP_CACHE_TTL_SECONDS = 12 * 60 * 60;

type SerpAnalysisReason = "no_organic_results";

type SerpAnalysisResult = {
  requestedKeyword: string;
  items: SerpResultItem[];
  reason?: SerpAnalysisReason;
};

const serpResultItemSchema = z.object({
  rank: z.number().int().safe().positive(),
  source: z.literal("DataForSEO Google Organic SERP"),
  fetchedAt: z.iso.datetime(),
  locationCode: z.number().int().positive(),
  languageCode: z.string(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  description: z.string(),
  etv: z.number().nullable(),
  estimatedPaidTrafficCost: z.number().nullable(),
  referringDomains: z.number().nullable(),
  backlinks: z.number().nullable(),
  isNew: z.boolean(),
  rankChange: z.number().nullable(),
});

const serpCacheSchema = z.object({
  contractVersion: z.literal(2),
  scope: z.object({
    organizationId: z.string(),
    projectId: z.string(),
    keyword: z.string(),
    locationCode: z.number().int().positive(),
    languageCode: z.string(),
  }),
  requestedKeyword: z.string(),
  items: z.array(serpResultItemSchema),
  reason: z.enum(["no_organic_results"]).optional(),
});

function mapOrganicSerpItems(
  items: SerpLiveItem[],
  meta: { fetchedAt: string; locationCode: number; languageCode: string },
): Array<z.infer<typeof serpResultItemSchema>> {
  return items
    .filter((item) => item.type === "organic")
    .map((item) => {
      const rank = safeSerpPosition(item.rank_absolute ?? item.rank_group);
      if (rank == null)
        throw new AppError(
          "INTERNAL_ERROR",
          "SERP observation has no valid organic position",
        );
      return {
        rank,
        source: "DataForSEO Google Organic SERP" as const,
        ...meta,
        title: item.title ?? "",
        url: item.url ?? "",
        domain: item.domain ?? "",
        description: item.description ?? "",
        etv: safeSerpEstimate(item.etv),
        estimatedPaidTrafficCost: safeSerpEstimate(
          item.estimated_paid_traffic_cost,
        ),
        referringDomains: safeSerpCount(item.backlinks_info?.referring_domains),
        backlinks: safeSerpCount(item.backlinks_info?.backlinks),
        isNew: false,
        rankChange: null,
      };
    });
}

async function getSerpLiveAnalysis(
  input: {
    projectId: string;
    keyword: string;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<SerpAnalysisResult> {
  const keyword = normalizeKeyword(input.keyword);
  const scope = {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  };

  const cacheKey = await buildCacheKey("serp:analysis:v2", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = serpCacheSchema.safeParse(cachedRaw);
  if (
    cached.success &&
    JSON.stringify(cached.data.scope) === JSON.stringify(scope)
  ) {
    return cached.data;
  }

  const liveItems = await createDataforseoClient(billingCustomer).serp.live({
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const items = mapOrganicSerpItems(liveItems, {
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    fetchedAt: new Date().toISOString(),
  });
  const result: z.infer<typeof serpCacheSchema> = {
    contractVersion: 2 as const,
    scope,
    requestedKeyword: keyword,
    items,
  };
  if (items.length === 0) {
    result.reason = "no_organic_results";
  }

  await setCached(cacheKey, result, SERP_CACHE_TTL_SECONDS).catch((error) => {
    console.error("keywords.serp.cache-write failed:", error);
  });

  return result;
}

export const getSerpAnalysis = getSerpLiveAnalysis;
