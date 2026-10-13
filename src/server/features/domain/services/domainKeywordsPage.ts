import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import {
  buildKeywordFilters,
  buildOrderBy,
  type DomainKeywordsSortMode,
  type DomainKeywordsSortOrder,
} from "@/server/features/domain/services/domainKeywordFilters";
import type { DomainKeywordsFilters } from "@/types/schemas/domain";

import { providerCount } from "@/shared/provider-observations";

const DOMAIN_KEYWORDS_PAGE_TTL_SECONDS = 12 * 60 * 60;

const domainKeywordsPageResultSchema = z.object({
  contractVersion: z.literal(2),
  source: z.literal("DataForSEO Labs"),
  scope: z.object({
    locationCode: z.number().int().positive(),
    languageCode: z.string(),
    includeSubdomains: z.boolean(),
    providerScope: z.literal("target"),
  }),
  domain: z.string(),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  hasMore: z.boolean(),
  keywords: z.array(
    z.object({
      keyword: z.string(),
      position: z
        .number()
        .int()
        .positive()
        .max(Number.MAX_SAFE_INTEGER)
        .nullable(),
      searchVolume: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER)
        .nullable(),
      traffic: z.number().nonnegative().nullable(),
      cpc: z.number().nonnegative().nullable(),
      url: z.string().nullable(),
      relativeUrl: z.string().nullable(),
      keywordDifficulty: z.number().int().min(0).max(100).nullable(),
    }),
  ),
  fetchedAt: z.iso.datetime(),
});

type DomainKeywordsPageResult = z.infer<typeof domainKeywordsPageResultSchema>;

export async function getKeywordsPage(
  input: {
    projectId: string;
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
    page: number;
    pageSize: number;
    sortMode: DomainKeywordsSortMode;
    sortOrder: DomainKeywordsSortOrder;
    filters: DomainKeywordsFilters;
    search?: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<DomainKeywordsPageResult> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);
  const offset = (input.page - 1) * input.pageSize;
  const orderBy = buildOrderBy(input.sortMode, input.sortOrder);
  const filters = buildKeywordFilters(input.filters, input.search);

  const cacheKey = await buildCacheKey("domain:keywords-page", {
    contractVersion: 2,
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain,
    includeSubdomains: input.includeSubdomains,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    page: input.page,
    pageSize: input.pageSize,
    sortMode: input.sortMode,
    sortOrder: input.sortOrder,
    filters: input.filters,
    search: input.search,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = domainKeywordsPageResultSchema.safeParse(cachedRaw);
  if (
    cached.success &&
    cached.data.domain === domain &&
    cached.data.scope.locationCode === input.locationCode &&
    cached.data.scope.languageCode === input.languageCode &&
    cached.data.scope.includeSubdomains === input.includeSubdomains
  ) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const response = await dataforseo.domain.rankedKeywords({
    target: domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: input.pageSize,
    offset,
    orderBy,
    filters: filters.length > 0 ? filters : undefined,
  });

  const keywords = response.items
    .map((item) => mapKeywordItem(item))
    .filter(
      (item): item is NonNullable<ReturnType<typeof mapKeywordItem>> =>
        item != null,
    );

  const totalCount = providerCount(response.totalCount);
  const hasMore =
    totalCount != null
      ? offset + response.items.length < totalCount
      : response.items.length === input.pageSize;

  const result: DomainKeywordsPageResult = {
    contractVersion: 2,
    source: "DataForSEO Labs",
    scope: {
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      includeSubdomains: input.includeSubdomains,
      providerScope: "target",
    },
    domain,
    page: input.page,
    pageSize: input.pageSize,
    totalCount,
    hasMore,
    keywords,
    fetchedAt: new Date().toISOString(),
  };

  await setCached(cacheKey, result, DOMAIN_KEYWORDS_PAGE_TTL_SECONDS).catch(
    (error) => {
      console.error("domain.keywords-page.cache-write failed:", error);
    },
  );

  return result;
}
