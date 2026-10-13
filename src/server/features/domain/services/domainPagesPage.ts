import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { normalizeDomainInput, toRelativePath } from "@/server/lib/domainUtils";
import type { RelevantPagesItem } from "@/server/lib/dataforseo";
import type { DomainKeywordsFilters } from "@/types/schemas/domain";

import { providerCount } from "@/shared/provider-observations";
import { keywordEstimate } from "@/shared/keyword-observations";

const DOMAIN_PAGES_PAGE_TTL_SECONDS = 12 * 60 * 60;

type DomainPagesSortMode = "traffic" | "keywords";
type DomainPagesSortOrder = "asc" | "desc";

const SORT_FIELD_BY_MODE: Record<DomainPagesSortMode, string> = {
  traffic: "metrics.organic.etv",
  keywords: "metrics.organic.count",
};

const domainPagesPageResultSchema = z.object({
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
  pages: z.array(
    z.object({
      page: z.string(),
      relativePath: z.string().nullable(),
      organicTraffic: z.number().nonnegative().nullable(),
      keywords: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER)
        .nullable(),
    }),
  ),
  fetchedAt: z.iso.datetime(),
});

type DomainPagesPageResult = z.infer<typeof domainPagesPageResultSchema>;

function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function pushAnd(filters: unknown[], expression: unknown[]) {
  if (filters.length > 0) filters.push("and");
  filters.push(expression);
}

function collectNumericRange(
  out: unknown[][],
  field: string,
  min: number | undefined,
  max: number | undefined,
) {
  if (typeof min === "number" && Number.isFinite(min)) {
    out.push([field, ">=", min]);
  }
  if (typeof max === "number" && Number.isFinite(max)) {
    out.push([field, "<=", max]);
  }
}

function parseTerms(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[,+]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function buildPageFilters(
  filters: DomainKeywordsFilters,
  searchTerm?: string,
): unknown[] {
  const conditions: unknown[][] = [];

  for (const term of parseTerms(filters.include)) {
    conditions.push(["page_address", "ilike", `%${escapeLikeTerm(term)}%`]);
  }
  for (const term of parseTerms(filters.exclude)) {
    conditions.push(["page_address", "not_ilike", `%${escapeLikeTerm(term)}%`]);
  }

  collectNumericRange(
    conditions,
    "metrics.organic.etv",
    filters.minTraffic,
    filters.maxTraffic,
  );
  collectNumericRange(
    conditions,
    "metrics.organic.count",
    filters.minVol,
    filters.maxVol,
  );

  const trimmed = searchTerm?.trim();
  if (trimmed) {
    conditions.push(["page_address", "ilike", `%${escapeLikeTerm(trimmed)}%`]);
  }

  const expressions: unknown[] = [];
  for (const condition of conditions) pushAnd(expressions, condition);
  return expressions;
}

function mapPageItem(item: RelevantPagesItem) {
  const url = item.page_address ?? null;
  if (!url) return null;
  const organic = item.metrics?.organic ?? null;
  const traffic = organic?.etv ?? null;
  const keywords = organic?.count ?? null;
  return {
    page: url,
    relativePath: toRelativePath(url),
    organicTraffic: keywordEstimate(traffic),
    keywords: providerCount(keywords),
  };
}

export async function getPagesPage(
  input: {
    projectId: string;
    domain: string;
    includeSubdomains: boolean;
    locationCode: number;
    languageCode: string;
    page: number;
    pageSize: number;
    sortMode: DomainPagesSortMode;
    sortOrder: DomainPagesSortOrder;
    filters: DomainKeywordsFilters;
    search?: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<DomainPagesPageResult> {
  const domain = normalizeDomainInput(input.domain, input.includeSubdomains);
  const offset = (input.page - 1) * input.pageSize;
  const orderBy = [`${SORT_FIELD_BY_MODE[input.sortMode]},${input.sortOrder}`];
  const filters = buildPageFilters(input.filters, input.search);

  const cacheKey = await buildCacheKey("domain:pages-page", {
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
  const cached = domainPagesPageResultSchema.safeParse(cachedRaw);
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
  const response = await dataforseo.domain.relevantPages({
    target: domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: input.pageSize,
    offset,
    orderBy,
    filters: filters.length > 0 ? filters : undefined,
  });

  const pages = response.items
    .map(mapPageItem)
    .filter(
      (item): item is NonNullable<ReturnType<typeof mapPageItem>> =>
        item != null,
    );

  const totalCount = providerCount(response.totalCount);
  const hasMore =
    totalCount != null
      ? offset + response.items.length < totalCount
      : response.items.length === input.pageSize;

  const result: DomainPagesPageResult = {
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
    pages,
    fetchedAt: new Date().toISOString(),
  };

  await setCached(cacheKey, result, DOMAIN_PAGES_PAGE_TTL_SECONDS).catch(
    (error) => {
      console.error("domain.pages-page.cache-write failed:", error);
    },
  );

  return result;
}
