import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
  type BacklinksHistoryItem,
  type BacklinksSummaryItem,
} from "@/server/lib/dataforseo";
import type {
  AnchorsPageInput,
  BacklinksLookupInput,
  BacklinksRowsPageInput,
  BacklinksSpamFilterOptions,
  ReferringDomainsPageInput,
  TopPagesPageInput,
} from "@/types/schemas/backlinks";

import {
  anchorsPageResultSchema,
  backlinksOverviewCacheSchema,
  backlinksRowsPageResultSchema,
  referringDomainsPageResultSchema,
  topPagesPageResultSchema,
  type AnchorsPageResult,
  type BacklinksOverviewResult,
  type BacklinksRowsPageResult,
  type ReferringDomainsPageResult,
  type TopPagesPageResult,
} from "@/types/schemas/backlinks-results";
import {
  buildAnchorsApiFilters,
  buildAnchorsOrderBy,
  buildBacklinksRowsApiFilters,
  buildBacklinksRowsOrderBy,
  buildReferringDomainsApiFilters,
  buildReferringDomainsOrderBy,
  buildTopPagesApiFilters,
  buildTopPagesOrderBy,
} from "@/server/features/backlinks/services/backlinksApiFilters";
import { toLinkBreakdown } from "@/server/features/backlinks/services/linkBreakdown";
import {
  mapAnchorsRows,
  mapBacklinksRows,
  mapReferringDomainsRows,
  mapTopPagesRows,
} from "@/server/features/backlinks/services/backlinksRowMappers";

/** Enough to show a meaningful split without turning into a long tail. */
const LINK_BREAKDOWN_LIMIT = 5;

// The page-request schemas carry projectId for the web middleware; the
// service layer is organization-scoped and never reads it.
export type BacklinksRowsPageServiceInput = Omit<
  BacklinksRowsPageInput,
  "projectId"
>;
export type ReferringDomainsPageServiceInput = Omit<
  ReferringDomainsPageInput,
  "projectId"
>;
export type TopPagesPageServiceInput = Omit<TopPagesPageInput, "projectId">;
export type AnchorsPageServiceInput = Omit<AnchorsPageInput, "projectId">;

const BACKLINKS_OVERVIEW_TTL_SECONDS = 6 * 60 * 60;
const BACKLINKS_TAB_TTL_SECONDS = 6 * 60 * 60;

export type BacklinksCache = {
  get(key: string): Promise<unknown>;
  set(key: string, data: unknown, ttlSeconds: number): Promise<void>;
};

type BacklinksOverviewProfile = {
  overview: BacklinksOverviewResult;
};

type BacklinksDateRange = {
  dateFrom: string;
  dateTo: string;
};

export async function profileBacklinksOverview(
  cache: BacklinksCache,
  cacheKey: string,
  input: BacklinksLookupInput,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<BacklinksOverviewProfile> {
  const cached = backlinksOverviewCacheSchema.safeParse(
    await cache.get(cacheKey),
  );
  if (cached.success) {
    return {
      overview: cached.data.overview,
    };
  }

  const dataforseo = createDataforseoClient(billingCustomer);

  const now = new Date();
  const normalizedTarget = normalizeBacklinksTarget(input.target, {
    scope: input.scope,
  });
  const dateRange = buildBacklinksDateRange(now);

  const [summary, history] = await Promise.all([
    dataforseo.backlinks.summary({
      target: normalizedTarget.apiTarget,
      creditFeature,
    }),
    normalizedTarget.scope === "domain"
      ? dataforseo.backlinks.history({
          target: normalizedTarget.apiTarget,
          ...dateRange,
          creditFeature,
        })
      : Promise.resolve([]),
  ]);

  const overview = buildOverviewResult({
    normalizedTarget,
    now,
    summary,
    history,
  });
  await cacheValue(
    cache,
    cacheKey,
    { overview },
    BACKLINKS_OVERVIEW_TTL_SECONDS,
  );

  return { overview };
}

export async function profileBacklinksRowsPage(
  cache: BacklinksCache,
  cacheKey: string,
  input: BacklinksRowsPageServiceInput,
  billingCustomer: BillingCustomerContext,
  spamOptions?: BacklinksSpamFilterOptions,
): Promise<BacklinksRowsPageResult> {
  const cached = backlinksRowsPageResultSchema.safeParse(
    await cache.get(cacheKey),
  );
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const offset = (input.page - 1) * input.pageSize;
  const filters = buildBacklinksRowsApiFilters(input.filters);

  const response = await dataforseo.backlinks.rows({
    target: normalizeBacklinksTarget(input.target, { scope: input.scope })
      .apiTarget,
    limit: input.pageSize,
    offset,
    orderBy: buildBacklinksRowsOrderBy(input.sortField, input.sortOrder),
    filters: filters.length > 0 ? filters : undefined,
    mode: input.mode,
    ...spamOptions,
  });

  const result = buildPageResult(input, offset, {
    rows: mapBacklinksRows(response.items),
    totalCount: response.totalCount,
  });
  await cacheValue(cache, cacheKey, result, BACKLINKS_TAB_TTL_SECONDS);

  return result;
}

export async function profileReferringDomainsPage(
  cache: BacklinksCache,
  cacheKey: string,
  input: ReferringDomainsPageServiceInput,
  billingCustomer: BillingCustomerContext,
  spamOptions?: BacklinksSpamFilterOptions,
): Promise<ReferringDomainsPageResult> {
  const cached = referringDomainsPageResultSchema.safeParse(
    await cache.get(cacheKey),
  );
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const offset = (input.page - 1) * input.pageSize;
  const filters = buildReferringDomainsApiFilters(input.filters);

  const response = await dataforseo.backlinks.referringDomains({
    target: normalizeBacklinksTarget(input.target, { scope: input.scope })
      .apiTarget,
    limit: input.pageSize,
    offset,
    orderBy: buildReferringDomainsOrderBy(input.sortField, input.sortOrder),
    filters: filters.length > 0 ? filters : undefined,
    ...spamOptions,
  });

  const result = buildPageResult(input, offset, {
    rows: mapReferringDomainsRows(response.items),
    totalCount: response.totalCount,
  });
  await cacheValue(cache, cacheKey, result, BACKLINKS_TAB_TTL_SECONDS);

  return result;
}

export async function profileTopPagesPage(
  cache: BacklinksCache,
  cacheKey: string,
  input: TopPagesPageServiceInput,
  billingCustomer: BillingCustomerContext,
): Promise<TopPagesPageResult> {
  const cached = topPagesPageResultSchema.safeParse(await cache.get(cacheKey));
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const offset = (input.page - 1) * input.pageSize;
  const filters = buildTopPagesApiFilters(input.filters);

  const response = await dataforseo.backlinks.domainPages({
    target: normalizeBacklinksTarget(input.target, { scope: input.scope })
      .apiTarget,
    limit: input.pageSize,
    offset,
    orderBy: buildTopPagesOrderBy(input.sortField, input.sortOrder),
    filters: filters.length > 0 ? filters : undefined,
  });

  const result = buildPageResult(input, offset, {
    rows: mapTopPagesRows(response.items),
    totalCount: response.totalCount,
  });
  await cacheValue(cache, cacheKey, result, BACKLINKS_TAB_TTL_SECONDS);

  return result;
}

export async function profileAnchorsPage(
  cache: BacklinksCache,
  cacheKey: string,
  input: AnchorsPageServiceInput,
  billingCustomer: BillingCustomerContext,
): Promise<AnchorsPageResult> {
  const cached = anchorsPageResultSchema.safeParse(await cache.get(cacheKey));
  if (cached.success) {
    return cached.data;
  }

  const dataforseo = createDataforseoClient(billingCustomer);
  const offset = (input.page - 1) * input.pageSize;
  const filters = buildAnchorsApiFilters(input.filters);

  const response = await dataforseo.backlinks.anchors({
    target: normalizeBacklinksTarget(input.target, { scope: input.scope })
      .apiTarget,
    limit: input.pageSize,
    offset,
    orderBy: buildAnchorsOrderBy(input.sortField, input.sortOrder),
    filters: filters.length > 0 ? filters : undefined,
  });

  const result = buildPageResult(input, offset, {
    rows: mapAnchorsRows(response.items),
    totalCount: response.totalCount,
  });
  await cacheValue(cache, cacheKey, result, BACKLINKS_TAB_TTL_SECONDS);

  return result;
}

function buildPageResult<TRow>(
  input: { page: number; pageSize: number },
  offset: number,
  data: { rows: TRow[]; totalCount: number | null },
) {
  const hasMore =
    data.totalCount != null
      ? offset + data.rows.length < data.totalCount
      : data.rows.length === input.pageSize;

  return {
    rows: data.rows,
    totalCount: data.totalCount,
    hasMore,
    page: input.page,
    pageSize: input.pageSize,
    fetchedAt: new Date().toISOString(),
  };
}

function buildBacklinksDateRange(now: Date): BacklinksDateRange {
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dateToUtc = new Date(todayUtc);
  dateToUtc.setUTCDate(dateToUtc.getUTCDate() - 1);

  const dateFromUtc = new Date(dateToUtc);
  dateFromUtc.setUTCFullYear(dateFromUtc.getUTCFullYear() - 1);

  return {
    dateFrom: dateFromUtc.toISOString().slice(0, 10),
    dateTo: dateToUtc.toISOString().slice(0, 10),
  };
}

function buildOverviewResult(args: {
  normalizedTarget: ReturnType<typeof normalizeBacklinksTarget>;
  now: Date;
  summary: BacklinksSummaryItem;
  history: BacklinksHistoryItem[];
}): BacklinksOverviewResult {
  const historyRows = args.history
    .map((item) => ({
      date: normalizeHistoryDate(item.date),
      backlinks: item.backlinks ?? null,
      referringDomains: item.referring_domains ?? null,
      rank: item.rank ?? null,
      newBacklinks: item.new_backlinks ?? null,
      lostBacklinks: item.lost_backlinks ?? null,
      newReferringDomains:
        item.new_referring_domains ?? item.new_reffering_domains ?? null,
      lostReferringDomains:
        item.lost_referring_domains ?? item.lost_reffering_domains ?? null,
    }))
    .filter(
      (
        item,
      ): item is typeof item & {
        date: string;
      } => item.date !== null,
    );

  return {
    target: args.normalizedTarget.apiTarget,
    displayTarget: args.normalizedTarget.displayTarget,
    scope: args.normalizedTarget.scope,
    summary: {
      rank: args.summary.rank ?? null,
      backlinks: args.summary.backlinks ?? null,
      referringPages: args.summary.referring_pages ?? null,
      referringDomains: args.summary.referring_domains ?? null,
      brokenBacklinks: args.summary.broken_backlinks ?? null,
      brokenPages: args.summary.broken_pages ?? null,
      backlinksSpamScore: args.summary.backlinks_spam_score ?? null,
      targetSpamScore: args.summary.info?.target_spam_score ?? null,
      newBacklinks: args.summary.new_backlinks ?? null,
      lostBacklinks: args.summary.lost_backlinks ?? null,
      newReferringDomains:
        args.summary.new_referring_domains ??
        args.summary.new_reffering_domains ??
        null,
      lostReferringDomains:
        args.summary.lost_referring_domains ??
        args.summary.lost_reffering_domains ??
        null,
      referringCountries: toLinkBreakdown(
        args.summary.referring_links_countries,
        LINK_BREAKDOWN_LIMIT,
      ),
      referringLinkTypes: toLinkBreakdown(
        args.summary.referring_links_types,
        LINK_BREAKDOWN_LIMIT,
      ),
      referringTlds: toLinkBreakdown(
        args.summary.referring_links_tld,
        LINK_BREAKDOWN_LIMIT,
      ),
    },
    trends: historyRows.map((item) => ({
      date: item.date,
      backlinks: item.backlinks,
      referringDomains: item.referringDomains,
      rank: item.rank,
    })),
    newLostTrends: historyRows.map((item) => ({
      date: item.date,
      newBacklinks: item.newBacklinks,
      lostBacklinks: item.lostBacklinks,
      newReferringDomains: item.newReferringDomains,
      lostReferringDomains: item.lostReferringDomains,
    })),
    fetchedAt: args.now.toISOString(),
  };
}

function normalizeHistoryDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

async function cacheValue(
  cache: BacklinksCache,
  key: string,
  data: unknown,
  ttlSeconds: number,
) {
  await cache.set(key, data, ttlSeconds).catch((error: unknown) => {
    console.error("backlinks.cache-write failed:", error);
  });
}
