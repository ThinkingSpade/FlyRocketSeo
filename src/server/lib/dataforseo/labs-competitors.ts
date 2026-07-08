import {
  DataforseoLabsGoogleBulkKeywordDifficultyLiveRequestInfo,
  DataforseoLabsGoogleBulkTrafficEstimationLiveRequestInfo,
  DataforseoLabsGoogleCompetitorsDomainLiveRequestInfo,
  DataforseoLabsGoogleDomainIntersectionLiveRequestInfo,
  DataforseoLabsGoogleHistoricalRankOverviewLiveRequestInfo,
  DataforseoLabsGoogleKeywordsForSiteLiveRequestInfo,
  DataforseoLabsGoogleSearchIntentLiveRequestInfo,
  DataforseoLabsGoogleSubdomainsLiveRequestInfo,
  type DataforseoLabsBulkKeywordDifficultyLiveItem,
  type DataforseoLabsCompetitorsDomainLiveItem,
  type DataforseoLabsDomainIntersectionLiveItem,
  type DataforseoLabsGoogleBulkTrafficEstimationLiveItem,
  type DataforseoLabsGoogleHistoricalRankOverviewLiveItem,
  type DataforseoLabsGoogleSearchIntentLiveItem,
  type DataforseoLabsSubdomainsLiveItem,
} from "dataforseo-client";
import { labsApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import type {
  DataforseoLabsItemType,
  LabsKeywordDataItem,
} from "@/server/lib/dataforseo/labs";

// Competitor-research Labs endpoints, split from labs.ts to keep both modules
// under the size ceiling. SDK item models are exposed directly like labs.ts.
export type CompetitorDomainItem = DataforseoLabsCompetitorsDomainLiveItem;
export type DomainIntersectionItem = DataforseoLabsDomainIntersectionLiveItem;
type SubdomainItem = DataforseoLabsSubdomainsLiveItem;
type KeywordDifficultyItem = DataforseoLabsBulkKeywordDifficultyLiveItem;
type SearchIntentItem = DataforseoLabsGoogleSearchIntentLiveItem;
type TrafficEstimationItem = DataforseoLabsGoogleBulkTrafficEstimationLiveItem;
type HistoricalRankOverviewItem =
  DataforseoLabsGoogleHistoricalRankOverviewLiveItem;

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
  return {
    data: {
      items: task.result?.[0]?.items ?? [],
      totalCount: task.result?.[0]?.total_count ?? null,
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
  return {
    data: {
      items: task.result?.[0]?.items ?? [],
      totalCount: task.result?.[0]?.total_count ?? null,
    },
    billing: buildTaskBilling(task),
  };
}

type KeywordsForSitePage = {
  items: LabsKeywordDataItem[];
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
  return {
    data: {
      items: task.result?.[0]?.items ?? [],
      totalCount: task.result?.[0]?.total_count ?? null,
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
  const task = assertOk(response);
  return {
    data: task.result?.[0]?.items ?? [],
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
  const task = assertOk(response);
  return {
    data: task.result?.[0]?.items ?? [],
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
  return {
    data: task.result?.[0]?.items ?? [],
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
  return {
    data: task.result?.[0]?.items ?? [],
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
  return {
    data: {
      items: task.result?.[0]?.items ?? [],
      totalCount: task.result?.[0]?.total_count ?? null,
    },
    billing: buildTaskBilling(task),
  };
}
