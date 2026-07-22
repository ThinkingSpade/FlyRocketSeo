import { z } from "zod";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { isRecord } from "@/server/lib/dataforseo/envelope";
import type {
  CompetitorDomainItem,
  DomainIntersectionItem,
} from "@/server/lib/dataforseo/labs-competitors";
import type { BacklinksIntersectionItem } from "@/server/lib/dataforseo/backlinks-insights";
import {
  competitorsPageSchema,
  type CompetitorRow,
  type CompetitorsPage,
  type KeywordGapMode,
} from "@/types/schemas/competitors";

/** Competitor and keyword-gap data refresh cadence, matching domain overview. */
const COMPETITORS_TTL_SECONDS = 12 * 60 * 60;

// Re-exported so the tables that render these rows keep importing the type
// from the service they came from.
export type { CompetitorRow };

const keywordGapRowSchema = z.object({
  keyword: z.string(),
  searchVolume: z.number().nullable(),
  cpc: z.number().nullable(),
  keywordDifficulty: z.number().nullable(),
  competition: z.number().nullable(),
  targetRank: z.number().nullable(),
  competitorRank: z.number().nullable(),
});

export type KeywordGapRow = z.infer<typeof keywordGapRowSchema>;

const keywordGapPageSchema = z.object({
  rows: z.array(keywordGapRowSchema),
  totalCount: z.number().nullable(),
  fetchedAt: z.string(),
});

type KeywordGapPage = z.infer<typeof keywordGapPageSchema>;

function readMetric(container: unknown, key: string): number | null {
  if (!isRecord(container)) return null;
  const organic = container.organic;
  if (!isRecord(organic)) return null;
  const value = organic[key];
  return typeof value === "number" ? value : null;
}

function mapCompetitorItem(item: CompetitorDomainItem): CompetitorRow | null {
  if (!item.domain) return null;
  return {
    domain: item.domain,
    avgPosition: item.avg_position ?? null,
    intersections: item.intersections ?? null,
    organicKeywords: readMetric(item.full_domain_metrics, "count"),
    organicTraffic: readMetric(item.full_domain_metrics, "etv"),
  };
}

async function getCompetitors(
  input: {
    projectId: string;
    target: string;
    locationCode: number;
    languageCode: string;
    excludeTopDomains: boolean;
    page: number;
    pageSize: number;
  },
  billingCustomer: BillingCustomerContext,
): Promise<CompetitorsPage> {
  const target = normalizeDomainInput(input.target, true);

  const cacheKey = await buildCacheKey("competitors:list", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    target,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    excludeTopDomains: input.excludeTopDomains,
    page: input.page,
    pageSize: input.pageSize,
  });

  // Records this analysis for the tab's history / auto-restore. Free and best
  // effort: one row pointing at the cache key we just used, so the tab can
  // render this exact result again without a metered fetch.
  //
  // First page only. The cache key is page-specific, so recording deeper pages
  // would let "your last run" restore page 3's rows into a tab that presents
  // them as the first page.
  const recordRun = async () => {
    if (input.page !== 1) return;
    await AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.competitors,
      params: {
        target: input.target,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        excludeTopDomains: input.excludeTopDomains,
      },
      cacheKey,
      label: target,
    });
  };

  const cached = competitorsPageSchema.safeParse(await getCached(cacheKey));
  if (cached.success && cached.data.rows.length > 0) {
    await recordRun();
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const response = await dataforseo.competitors.domainCompetitors({
    target,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
    excludeTopDomains: input.excludeTopDomains,
    // Rank by shared-keyword volume so obvious rivals surface first.
    orderBy: ["intersections,desc"],
  });

  const rows = response.items
    .map(mapCompetitorItem)
    .filter((row): row is CompetitorRow => row != null)
    // The target itself is always its own top "competitor"; drop it.
    .filter((row) => row.domain !== target);

  const result: CompetitorsPage = {
    rows,
    totalCount: response.totalCount,
    fetchedAt: new Date().toISOString(),
  };

  if (rows.length > 0) {
    void setCached(cacheKey, result, COMPETITORS_TTL_SECONDS).catch((error) => {
      console.error("competitors.list.cache-write failed:", error);
    });
    await recordRun();
  }

  return result;
}

function readKeywordInfoNumber(item: DomainIntersectionItem, key: string) {
  // Typed as unknown so the index read below yields unknown, not the SDK's any.
  const info: unknown = item.keyword_data?.keyword_info;
  if (!isRecord(info)) return null;
  const value = info[key];
  return typeof value === "number" ? value : null;
}

function readRank(element: unknown): number | null {
  if (!isRecord(element)) return null;
  return typeof element.rank_absolute === "number"
    ? element.rank_absolute
    : null;
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
    searchVolume: readKeywordInfoNumber(item, "search_volume"),
    cpc: readKeywordInfoNumber(item, "cpc"),
    keywordDifficulty: typeof difficulty === "number" ? difficulty : null,
    competition: readKeywordInfoNumber(item, "competition"),
    // In "missing" mode the request swaps targets (competitor first), so map
    // the SERP elements back to stable target/competitor columns.
    targetRank: mode === "missing" ? secondRank : firstRank,
    competitorRank: mode === "missing" ? firstRank : secondRank,
  };
}

async function getKeywordGap(
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
  if (cached.success && cached.data.rows.length > 0) {
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
    rows,
    totalCount: response.totalCount,
    fetchedAt: new Date().toISOString(),
  };

  if (rows.length > 0) {
    void setCached(cacheKey, result, COMPETITORS_TTL_SECONDS).catch((error) => {
      console.error("competitors.keyword-gap.cache-write failed:", error);
    });
  }

  return result;
}

const linkGapRowSchema = z.object({
  referringDomain: z.string(),
  rank: z.number().nullable(),
  backlinksToCompetitor: z.number().nullable(),
  spamScore: z.number().nullable(),
  firstSeen: z.string().nullable(),
});

export type LinkGapRow = z.infer<typeof linkGapRowSchema>;

const linkGapPageSchema = z.object({
  rows: z.array(linkGapRowSchema),
  totalCount: z.number().nullable(),
  fetchedAt: z.string(),
});

type LinkGapPage = z.infer<typeof linkGapPageSchema>;

function mapLinkGapItem(item: BacklinksIntersectionItem): LinkGapRow | null {
  // Single-competitor lookups have exactly one intersection entry ("1"); its
  // `target` is the referring domain that links to the competitor.
  const entry = Object.values(item.domain_intersection ?? {})[0];
  if (!entry?.target) return null;
  return {
    referringDomain: entry.target,
    rank: entry.rank ?? null,
    backlinksToCompetitor: entry.backlinks ?? null,
    spamScore: entry.backlinks_spam_score ?? null,
    firstSeen: entry.first_seen ?? null,
  };
}

async function getLinkGap(
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
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    target,
    competitor,
    page: input.page,
    pageSize: input.pageSize,
  });

  const cached = linkGapPageSchema.safeParse(await getCached(cacheKey));
  if (cached.success && cached.data.rows.length > 0) {
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
    rows,
    totalCount: response.totalCount,
    fetchedAt: new Date().toISOString(),
  };

  if (rows.length > 0) {
    void setCached(cacheKey, result, COMPETITORS_TTL_SECONDS).catch((error) => {
      console.error("competitors.link-gap.cache-write failed:", error);
    });
  }

  return result;
}

export const CompetitorsService = {
  getCompetitors,
  getKeywordGap,
  getLinkGap,
} as const;
