import { z } from "zod";
import {
  providerCount,
  providerHundredScore,
  providerTimestamp,
} from "@/shared/provider-observations";
import {
  keywordEstimate,
  keywordPosition,
  keywordScore,
  keywordRatio,
} from "@/shared/keyword-observations";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { isRecord } from "@/server/lib/dataforseo/envelope";
import type { DomainIntersectionItem } from "@/server/lib/dataforseo/labs-competitors";
import type { BacklinksIntersectionItem } from "@/server/lib/dataforseo/backlinks-insights";
import type { KeywordGapMode } from "@/types/schemas/competitors";
const COMPETITORS_TTL_SECONDS = 12 * 60 * 60;
const keywordGapRowSchema = z.object({
  keyword: z.string(),
  searchVolume: z.number().nullable().transform(providerCount),
  cpc: z.number().nullable().transform(keywordEstimate),
  keywordDifficulty: z.number().nullable().transform(keywordScore),
  competition: z.number().nullable().transform(keywordRatio),
  targetRank: z.number().nullable().transform(keywordPosition),
  competitorRank: z.number().nullable().transform(keywordPosition),
});

export type KeywordGapRow = z.infer<typeof keywordGapRowSchema>;

const keywordGapPageSchema = z.object({
  contractVersion: z.literal(2),
  source: z.literal("DataForSEO Labs"),
  scope: z.object({
    projectId: z.string(),
    target: z.string(),
    competitor: z.string(),
    mode: z.enum(["missing", "shared", "advantage"]),
    locationCode: z.number(),
    languageCode: z.string(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    minSearchVolume: z.number().nullable(),
  }),
  rows: z.array(keywordGapRowSchema),
  hasMore: z.boolean(),
  totalCount: z.number().nullable().transform(providerCount),
  fetchedAt: z.string().datetime(),
});

export type KeywordGapPage = z.infer<typeof keywordGapPageSchema>;

function readKeywordInfoNumber(item: DomainIntersectionItem, key: string) {
  // Typed as unknown so the index read below yields unknown, not the SDK's any.
  const info: unknown = item.keyword_data?.keyword_info;
  if (!isRecord(info)) return null;
  const value = info[key];
  return typeof value === "number" ? value : null;
}

function readRank(element: unknown): number | null {
  if (!isRecord(element)) return null;
  return keywordPosition(element.rank_absolute);
}

function mapGapItem(
  item: DomainIntersectionItem,
  mode: KeywordGapMode,
): KeywordGapRow | null {
  const keyword = item.keyword_data?.keyword;
  if (!keyword) return null;

  const firstRank = readRank(item.first_domain_serp_element);
  const secondRank = readRank(item.second_domain_serp_element);
  const difficulty = item.keyword_data?.keyword_properties?.keyword_difficulty;

  return {
    keyword,
    searchVolume: providerCount(readKeywordInfoNumber(item, "search_volume")),
    cpc: keywordEstimate(readKeywordInfoNumber(item, "cpc")),
    keywordDifficulty: keywordScore(difficulty),
    competition: keywordRatio(readKeywordInfoNumber(item, "competition")),
    // In "missing" mode the request swaps targets (competitor first), so map
    // the SERP elements back to stable target/competitor columns.
    targetRank: mode === "missing" ? secondRank : firstRank,
    competitorRank: mode === "missing" ? firstRank : secondRank,
  };
}

export async function getKeywordGap(
  input: {
    projectId: string;
    target: string;
    competitor: string;
    mode: KeywordGapMode;
    locationCode: number;
    languageCode: string;
    minSearchVolume?: number;
    page: number;
    pageSize: number;
  },
  billingCustomer: BillingCustomerContext,
): Promise<KeywordGapPage> {
  const target = normalizeDomainInput(input.target, true);
  const competitor = normalizeDomainInput(input.competitor, true);

  const cacheKey = await buildCacheKey("competitors:keyword-gap", {
    contractVersion: 2,
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    target,
    competitor,
    mode: input.mode,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    minSearchVolume: input.minSearchVolume ?? null,
    page: input.page,
    pageSize: input.pageSize,
  });

  const cached = keywordGapPageSchema.safeParse(await getCached(cacheKey));
  if (
    cached.success &&
    cached.data.scope.projectId === input.projectId &&
    cached.data.scope.target === target &&
    cached.data.scope.competitor === competitor &&
    cached.data.scope.mode === input.mode &&
    cached.data.scope.locationCode === input.locationCode &&
    cached.data.scope.languageCode === input.languageCode &&
    cached.data.scope.page === input.page &&
    cached.data.scope.pageSize === input.pageSize &&
    cached.data.scope.minSearchVolume === (input.minSearchVolume ?? null)
  ) {
    return cached.data;
  }

  // DataForSEO's intersections=false returns keywords where target1 ranks and
  // target2 does not, so "missing" (competitor-only keywords) puts the
  // competitor first.
  const [target1, target2] =
    input.mode === "missing" ? [competitor, target] : [target, competitor];

  const filters =
    input.minSearchVolume != null
      ? [
          [
            "keyword_data.keyword_info.search_volume",
            ">=",
            input.minSearchVolume,
          ],
        ]
      : undefined;

  const dataforseo = createDataforseoClient(billingCustomer);
  const response = await dataforseo.competitors.keywordGap({
    target1,
    target2,
    intersections: input.mode === "shared",
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
    filters,
    orderBy: ["keyword_data.keyword_info.search_volume,desc"],
  });

  const rows = response.items
    .map((item) => mapGapItem(item, input.mode))
    .filter((row): row is KeywordGapRow => row != null);

  const result: KeywordGapPage = {
    contractVersion: 2,
    source: "DataForSEO Labs",
    scope: {
      projectId: input.projectId,
      target,
      competitor,
      mode: input.mode,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      page: input.page,
      pageSize: input.pageSize,
      minSearchVolume: input.minSearchVolume ?? null,
    },
    rows,
    hasMore:
      providerCount(response.totalCount) !== null
        ? input.page * input.pageSize < response.totalCount!
        : response.items.length === input.pageSize,
    totalCount: providerCount(response.totalCount),
    fetchedAt: new Date().toISOString(),
  };

  {
    await setCached(cacheKey, result, COMPETITORS_TTL_SECONDS).catch(
      (error) => {
        console.error("competitors.keyword-gap.cache-write failed:", error);
      },
    );
  }

  return result;
}

const linkGapRowSchema = z.object({
  referringDomain: z.string(),
  rank: z.number().nullable().transform(providerHundredScore),
  backlinksToCompetitor: z.number().nullable().transform(providerCount),
  spamScore: z.number().nullable().transform(providerHundredScore),
  firstSeen: z.string().nullable().transform(providerTimestamp),
});

export type LinkGapRow = z.infer<typeof linkGapRowSchema>;

const linkGapPageSchema = z.object({
  contractVersion: z.literal(2),
  source: z.literal("DataForSEO Backlinks"),
  scope: z.object({
    projectId: z.string(),
    target: z.string(),
    competitor: z.string(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  }),
  rows: z.array(linkGapRowSchema),
  hasMore: z.boolean(),
  totalCount: z.number().nullable().transform(providerCount),
  fetchedAt: z.string().datetime(),
});

export type LinkGapPage = z.infer<typeof linkGapPageSchema>;

function mapLinkGapItem(item: BacklinksIntersectionItem): LinkGapRow | null {
  // Single-competitor lookups have exactly one intersection entry ("1"); its
  // `target` is the referring domain that links to the competitor.
  const entry = Object.values(item.domain_intersection ?? {})[0];
  if (!entry?.target) return null;
  return {
    referringDomain: entry.target,
    rank: providerHundredScore(entry.rank),
    backlinksToCompetitor: providerCount(entry.backlinks),
    spamScore: providerHundredScore(entry.backlinks_spam_score),
    firstSeen: providerTimestamp(entry.first_seen),
  };
}

export async function getLinkGap(
  input: {
    projectId: string;
    target: string;
    competitor: string;
    page: number;
    pageSize: number;
  },
  billingCustomer: BillingCustomerContext,
): Promise<LinkGapPage> {
  const target = normalizeDomainInput(input.target, true);
  const competitor = normalizeDomainInput(input.competitor, true);

  const cacheKey = await buildCacheKey("competitors:link-gap", {
    contractVersion: 2,
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    target,
    competitor,
    page: input.page,
    pageSize: input.pageSize,
  });

  const cached = linkGapPageSchema.safeParse(await getCached(cacheKey));
  if (
    cached.success &&
    cached.data.scope.projectId === input.projectId &&
    cached.data.scope.target === target &&
    cached.data.scope.competitor === competitor &&
    cached.data.scope.page === input.page &&
    cached.data.scope.pageSize === input.pageSize
  ) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  // Referring domains that link to the competitor but not to the target.
  const response = await dataforseo.backlinks.domainIntersection({
    targets: [competitor],
    excludeTargets: [target],
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
    orderBy: ["1.rank,desc"],
  });

  const rows = response.items
    .map(mapLinkGapItem)
    .filter((row): row is LinkGapRow => row != null);

  const result: LinkGapPage = {
    contractVersion: 2,
    source: "DataForSEO Backlinks",
    scope: {
      projectId: input.projectId,
      target,
      competitor,
      page: input.page,
      pageSize: input.pageSize,
    },
    rows,
    hasMore:
      providerCount(response.totalCount) !== null
        ? input.page * input.pageSize < response.totalCount!
        : response.items.length === input.pageSize,
    totalCount: providerCount(response.totalCount),
    fetchedAt: new Date().toISOString(),
  };

  {
    await setCached(cacheKey, result, COMPETITORS_TTL_SECONDS).catch(
      (error) => {
        console.error("competitors.link-gap.cache-write failed:", error);
      },
    );
  }

  return result;
}
