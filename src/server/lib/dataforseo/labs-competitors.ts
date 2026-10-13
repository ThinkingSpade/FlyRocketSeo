import {
  DataforseoLabsGoogleBulkKeywordDifficultyLiveRequestInfo,
  DataforseoLabsGoogleBulkTrafficEstimationLiveRequestInfo,
  DataforseoLabsGoogleCompetitorsDomainLiveRequestInfo,
  DataforseoLabsGoogleDomainIntersectionLiveRequestInfo,
  DataforseoLabsGoogleHistoricalRankOverviewLiveRequestInfo,
  DataforseoLabsGoogleKeywordsForSiteLiveRequestInfo,
  DataforseoLabsGoogleSearchIntentLiveRequestInfo,
  DataforseoLabsGoogleSerpCompetitorsLiveRequestInfo,
  DataforseoLabsGoogleSubdomainsLiveRequestInfo,
} from "dataforseo-client";
import type { z } from "zod";
import { providerCount } from "@/shared/provider-observations";
import {
  competitorTaskItems,
  competitorItemSchema,
  serpCompetitorItemSchema,
  intersectionItemSchema,
  siteKeywordItemSchema,
  difficultyItemSchema,
  intentItemSchema,
  trafficItemSchema,
  subdomainItemSchema,
  historicalItemSchema,
} from "./labs-competitor-contract";
import { labsApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import type { DataforseoLabsItemType } from "@/server/lib/dataforseo/labs";

// Competitor-research Labs endpoints, split from labs.ts to keep both modules
// under the size ceiling. Public consumed fields are normalized at the SDK seam.
export type CompetitorDomainItem = z.infer<typeof competitorItemSchema>;
export type DomainIntersectionItem = z.infer<typeof intersectionItemSchema>;
type SubdomainItem = z.infer<typeof subdomainItemSchema>;
type KeywordDifficultyItem = z.infer<typeof difficultyItemSchema>;
type SearchIntentItem = z.infer<typeof intentItemSchema>;
type TrafficEstimationItem = z.infer<typeof trafficItemSchema>;
export type HistoricalRankOverviewItem = z.infer<typeof historicalItemSchema>;

type CompetitorsDomainPage = {
  items: CompetitorDomainItem[];
  totalCount: number | null;
};

export async function fetchCompetitorsDomain(input: {
  target: string;
  locationCode: number;
  languageCode: string;
  limit: number;
  offset?: number;
  itemTypes?: DataforseoLabsItemType[];
  excludeTopDomains?: boolean;
  maxRankGroup?: number;
  filters?: unknown[];
  orderBy?: string[];
}): Promise<DataforseoApiResponse<CompetitorsDomainPage>> {
  const response = await labsApi().googleCompetitorsDomainLive([
    new DataforseoLabsGoogleCompetitorsDomainLiveRequestInfo({
      target: input.target,
      location_code: input.locationCode,
      language_code: input.languageCode,
      limit: input.limit,
      offset: input.offset,
      item_types: input.itemTypes,
      exclude_top_domains: input.excludeTopDomains,
      max_rank_group: input.maxRankGroup,
      filters: input.filters,
      order_by: input.orderBy,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = competitorTaskItems(task, input, competitorItemSchema);
  return {
    data: {
      items,
      totalCount: providerCount(task.result?.[0]?.total_count),
    },
    billing: buildTaskBilling(task),
  };
}

type SerpCompetitorItem = z.infer<typeof serpCompetitorItemSchema>;

type SerpCompetitorsPage = {
  items: SerpCompetitorItem[];
  totalCount: number | null;
};

/**
 * Competitors discovered from a KEYWORD LIST rather than a domain.
 *
 * `competitors_domain` above answers "who shares ranked keywords with this
 * domain", which ranks by absolute overlap and therefore favours whichever
 * candidate has the largest keyword footprint. This endpoint answers "who
 * appears in the SERPs for these specific keywords", so the caller controls
 * the market being measured -- and each item carries `keywords_positions`,
 * the per-keyword ranks needed to say whether a domain actually outranks the
 * client.
 *
 * Callers MUST pass `itemTypes: ["organic"]`. The endpoint's default item
 * types include paid results, which would let a rival's AD placement count as
 * outranking the client's organic position. Billing (verified 2026-08-10):
 * $0.012 per task + $0.00012 per returned row, and the keyword array is ONE
 * task regardless of its length. Documented caps: 200 keywords, limit 1,000.
 */
export async function fetchSerpCompetitors(input: {
  keywords: string[];
  locationCode: number;
  languageCode: string;
  limit: number;
  offset?: number;
  itemTypes?: DataforseoLabsItemType[];
  filters?: unknown[];
  orderBy?: string[];
}): Promise<DataforseoApiResponse<SerpCompetitorsPage>> {
  const response = await labsApi().googleSerpCompetitorsLive([
    new DataforseoLabsGoogleSerpCompetitorsLiveRequestInfo({
      keywords: input.keywords,
      location_code: input.locationCode,
      language_code: input.languageCode,
      limit: input.limit,
      offset: input.offset,
      item_types: input.itemTypes,
      filters: input.filters,
      order_by: input.orderBy,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = competitorTaskItems(task, input, serpCompetitorItemSchema);
  return {
    data: {
      items,
      totalCount: providerCount(task.result?.[0]?.total_count),
    },
    billing: buildTaskBilling(task),
  };
}

type DomainIntersectionPage = {
  items: DomainIntersectionItem[];
  totalCount: number | null;
};

export async function fetchDomainIntersection(input: {
  target1: string;
  target2: string;
  locationCode: number;
  languageCode: string;
  limit: number;
  offset?: number;
  /**
   * true -> keywords where BOTH domains rank (shared keywords);
   * false -> keywords where target1 ranks and target2 does not (gap keywords).
   */
  intersections: boolean;
  itemTypes?: DataforseoLabsItemType[];
  filters?: unknown[];
  orderBy?: string[];
}): Promise<DataforseoApiResponse<DomainIntersectionPage>> {
  // SDK codegen quirk: the constructor's init() reads `target1`/`target2`
  // while the TS interface declares `target_1`/`target_2`, so targets passed
  // through the constructor are silently dropped. Assign the properties
  // directly; toJSON serialises them to the wire keys DataForSEO expects.
  const request = new DataforseoLabsGoogleDomainIntersectionLiveRequestInfo({
    location_code: input.locationCode,
    language_code: input.languageCode,
    intersections: input.intersections,
    item_types: input.itemTypes,
    include_serp_info: false,
    include_clickstream_data: false,
    limit: input.limit,
    offset: input.offset,
    filters: input.filters,
    order_by: input.orderBy,
  });
  request.target_1 = input.target1;
  request.target_2 = input.target2;
  const response = await labsApi().googleDomainIntersectionLive([request]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = competitorTaskItems(task, input, intersectionItemSchema);
  return {
    data: {
      items,
      totalCount: providerCount(task.result?.[0]?.total_count),
    },
    billing: buildTaskBilling(task),
  };
}

type KeywordsForSitePage = {
  items: z.infer<typeof siteKeywordItemSchema>[];
  totalCount: number | null;
};

export async function fetchKeywordsForSite(input: {
  target: string;
  locationCode: number;
  languageCode: string;
  limit: number;
  offset?: number;
  includeSubdomains?: boolean;
  filters?: unknown[];
  orderBy?: string[];
}): Promise<DataforseoApiResponse<KeywordsForSitePage>> {
  const response = await labsApi().googleKeywordsForSiteLive([
    new DataforseoLabsGoogleKeywordsForSiteLiveRequestInfo({
      target: input.target,
      location_code: input.locationCode,
      language_code: input.languageCode,
      limit: input.limit,
      offset: input.offset,
      include_subdomains: input.includeSubdomains,
      include_serp_info: false,
      include_clickstream_data: false,
      filters: input.filters,
      order_by: input.orderBy,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = competitorTaskItems(task, input, siteKeywordItemSchema);
  return {
    data: {
      items,
      totalCount: providerCount(task.result?.[0]?.total_count),
    },
    billing: buildTaskBilling(task),
  };
}

export async function fetchBulkKeywordDifficulty(input: {
  keywords: string[];
  locationCode: number;
  languageCode: string;
}): Promise<DataforseoApiResponse<KeywordDifficultyItem[]>> {
  const response = await labsApi().googleBulkKeywordDifficultyLive([
    new DataforseoLabsGoogleBulkKeywordDifficultyLiveRequestInfo({
      keywords: input.keywords,
      location_code: input.locationCode,
      language_code: input.languageCode,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = competitorTaskItems(task, input, difficultyItemSchema);
  return {
    data: items,
    billing: buildTaskBilling(task),
  };
}

export async function fetchSearchIntent(input: {
  keywords: string[];
  languageCode: string;
}): Promise<DataforseoApiResponse<SearchIntentItem[]>> {
  const response = await labsApi().googleSearchIntentLive([
    new DataforseoLabsGoogleSearchIntentLiveRequestInfo({
      keywords: input.keywords,
      language_code: input.languageCode,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = competitorTaskItems(task, input, intentItemSchema);
  return {
    data: items,
    billing: buildTaskBilling(task),
  };
}

export async function fetchBulkTrafficEstimation(input: {
  targets: string[];
  locationCode: number;
  languageCode: string;
  itemTypes?: DataforseoLabsItemType[];
}): Promise<DataforseoApiResponse<TrafficEstimationItem[]>> {
  const response = await labsApi().googleBulkTrafficEstimationLive([
    new DataforseoLabsGoogleBulkTrafficEstimationLiveRequestInfo({
      targets: input.targets,
      location_code: input.locationCode,
      language_code: input.languageCode,
      item_types: input.itemTypes,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = competitorTaskItems(task, input, trafficItemSchema);
  return {
    data: items,
    billing: buildTaskBilling(task),
  };
}

export async function fetchHistoricalRankOverview(input: {
  target: string;
  locationCode: number;
  languageCode: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<DataforseoApiResponse<HistoricalRankOverviewItem[]>> {
  const response = await labsApi().googleHistoricalRankOverviewLive([
    new DataforseoLabsGoogleHistoricalRankOverviewLiveRequestInfo({
      target: input.target,
      location_code: input.locationCode,
      language_code: input.languageCode,
      date_from: input.dateFrom,
      date_to: input.dateTo,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = competitorTaskItems(task, input, historicalItemSchema);
  return {
    data: items,
    billing: buildTaskBilling(task),
  };
}

type SubdomainsPage = {
  items: SubdomainItem[];
  totalCount: number | null;
};

export async function fetchSubdomains(input: {
  target: string;
  locationCode: number;
  languageCode: string;
  limit: number;
  offset?: number;
  itemTypes?: DataforseoLabsItemType[];
  filters?: unknown[];
  orderBy?: string[];
}): Promise<DataforseoApiResponse<SubdomainsPage>> {
  const response = await labsApi().googleSubdomainsLive([
    new DataforseoLabsGoogleSubdomainsLiveRequestInfo({
      target: input.target,
      location_code: input.locationCode,
      language_code: input.languageCode,
      limit: input.limit,
      offset: input.offset,
      item_types: input.itemTypes,
      filters: input.filters,
      order_by: input.orderBy,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = competitorTaskItems(task, input, subdomainItemSchema);
  return {
    data: {
      items,
      totalCount: providerCount(task.result?.[0]?.total_count),
    },
    billing: buildTaskBilling(task),
  };
}
