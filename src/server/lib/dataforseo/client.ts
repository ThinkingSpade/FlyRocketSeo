import {
  type CreditFeature,
  mapDataforseoPathToCreditFeature,
} from "@/shared/billing-credit-features";
import {
  assertUsageCreditsAvailable,
  getOrCreateOrganizationCustomer,
  trackUsageCreditSpend,
} from "@/server/billing/subscription";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  DataforseoChargedTaskError,
  type DataforseoApiCallCost,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";

export { mapDataforseoPathToCreditFeature };

/**
 * Loads the section fetchers on first use. This dynamic import() is the whole
 * point of the file: it keeps fetchers.ts — and the 1.6 MB dataforseo-client
 * SDK the leaf modules pull in — in an on-demand chunk, so a cold isolate never
 * parses the SDK just to serve an unrelated request. The module resolves once
 * per isolate and the runtime caches it thereafter.
 */
const loadFetchers = () => import("@/server/lib/dataforseo/fetchers");
type Fetchers = Awaited<ReturnType<typeof loadFetchers>>;

/**
 * Wraps a section fetcher with billing metering. Each entry on the client is
 * `lazyMeter(customer, (f) => f.fetcher, defaultFeature?)`, which returns a
 * function with the fetcher's own input type and resolves to its unwrapped
 * `.data`. The fetcher is picked from the lazily-loaded module, so it — and the
 * SDK behind it — never enters the startup graph.
 *
 * `defaultFeature` is the fallback credit feature; a caller can override it per
 * call by passing `creditFeature` in the input (e.g. an MCP tool attributing
 * spend to its own feature). The extra field is ignored by the fetchers, which
 * read named fields rather than spreading the input.
 */
function lazyMeter<I, T>(
  customer: BillingCustomerContext,
  pick: (f: Fetchers) => (input: I) => Promise<DataforseoApiResponse<T>>,
  defaultFeature?: CreditFeature,
): (input: I & { creditFeature?: CreditFeature }) => Promise<T> {
  return (input) =>
    meterDataforseoCall(
      customer,
      async () => pick(await loadFetchers())(input),
      input.creditFeature ?? defaultFeature,
    );
}

export function createDataforseoClient(customer: BillingCustomerContext) {
  return {
    business: {
      businessListings: lazyMeter(
        customer,
        (f) => f.fetchBusinessListingsSearch,
        "local_seo",
      ),
      questionsAnswers: lazyMeter(
        customer,
        (f) => f.fetchQuestionsAnswers,
        "local_seo",
      ),
      myBusinessInfo: lazyMeter(
        customer,
        (f) => f.fetchMyBusinessInfo,
        "local_seo",
      ),
      // Charged at post time; results are collected for free via
      // fetchGoogleReviewsResult (not metered, so not on the client).
      postReviewsTask: lazyMeter(
        customer,
        (f) => f.postGoogleReviewsTask,
        "local_seo",
      ),
    },
    backlinks: {
      summary: lazyMeter(customer, (f) => f.fetchBacklinksSummary),
      rows: lazyMeter(customer, (f) => f.fetchBacklinksRows),
      referringDomains: lazyMeter(customer, (f) => f.fetchReferringDomains),
      domainPages: lazyMeter(customer, (f) => f.fetchDomainPagesSummary),
      history: lazyMeter(customer, (f) => f.fetchBacklinksHistory),
      anchors: lazyMeter(customer, (f) => f.fetchBacklinksAnchors),
      competitors: lazyMeter(customer, (f) => f.fetchBacklinksCompetitors),
      domainIntersection: lazyMeter(
        customer,
        (f) => f.fetchBacklinksDomainIntersection,
      ),
      bulkSpamScores: lazyMeter(customer, (f) => f.fetchBulkSpamScores),
      newLostTimeseries: lazyMeter(
        customer,
        (f) => f.fetchBacklinksNewLostTimeseries,
      ),
    },
    keywords: {
      related: lazyMeter(customer, (f) => f.fetchRelatedKeywords),
      suggestions: lazyMeter(customer, (f) => f.fetchKeywordSuggestions),
      ideas: lazyMeter(customer, (f) => f.fetchKeywordIdeas),
      forSite: lazyMeter(customer, (f) => f.fetchKeywordsForSite),
      bulkDifficulty: lazyMeter(customer, (f) => f.fetchBulkKeywordDifficulty),
      searchIntent: lazyMeter(customer, (f) => f.fetchSearchIntent),
      trends: lazyMeter(customer, (f) => f.fetchGoogleTrendsExplore),
      clickstreamVolume: lazyMeter(
        customer,
        (f) => f.fetchClickstreamSearchVolume,
      ),
      globalVolume: lazyMeter(customer, (f) => f.fetchGlobalSearchVolume),
      // Google Ads endpoints for countries Labs doesn't support.
      adsIdeas: lazyMeter(customer, (f) => f.fetchAdsKeywordIdeas),
      adsSearchVolume: lazyMeter(customer, (f) => f.fetchAdsSearchVolume),
    },
    domain: {
      rankOverview: lazyMeter(customer, (f) => f.fetchDomainRankOverview),
      rankedKeywords: lazyMeter(customer, (f) => f.fetchRankedKeywords),
      relevantPages: lazyMeter(customer, (f) => f.fetchRelevantPages),
      historicalRankOverview: lazyMeter(
        customer,
        (f) => f.fetchHistoricalRankOverview,
      ),
    },
    competitors: {
      domainCompetitors: lazyMeter(customer, (f) => f.fetchCompetitorsDomain),
      keywordGap: lazyMeter(customer, (f) => f.fetchDomainIntersection),
      trafficEstimation: lazyMeter(
        customer,
        (f) => f.fetchBulkTrafficEstimation,
      ),
      subdomains: lazyMeter(customer, (f) => f.fetchSubdomains),
    },
    serp: {
      live: lazyMeter(customer, (f) => f.fetchLiveSerp),
      rankCheck: lazyMeter(
        customer,
        (f) => f.fetchRankCheckSerp,
        "rank_tracking",
      ),
      // Posts up to 100 queued rank check tasks; one metered charge covers the
      // whole batch (DataForSEO bills task_post at post time, collection is
      // free).
      rankCheckTaskPost: lazyMeter(
        customer,
        (f) => f.postRankCheckTasks,
        "rank_tracking",
      ),
      local: lazyMeter(customer, (f) => f.fetchLocalSerp, "local_seo"),
    },
    labs: {
      // Callers (e.g. the keyword-metrics MCP tool) can attribute the spend to
      // their own feature by passing `creditFeature` in the input; defaults to
      // rank_tracking when omitted.
      keywordOverview: lazyMeter(
        customer,
        (f) => f.fetchKeywordOverview,
        "rank_tracking",
      ),
      serpCompetitors: lazyMeter(customer, (f) => f.fetchSerpCompetitors),
    },
    lighthouse: {
      live: lazyMeter(customer, (f) => f.fetchLighthouseResult),
    },
    onPage: {
      instantPage: lazyMeter(customer, (f) => f.fetchInstantPageAudit),
    },
    aiSearch: {
      mentionsSearch: lazyMeter(customer, (f) => f.fetchLlmMentionsSearch),
      aggregatedMetrics: lazyMeter(
        customer,
        (f) => f.fetchLlmAggregatedMetrics,
      ),
      topPages: lazyMeter(customer, (f) => f.fetchLlmTopPages),
      crossAggregatedMetrics: lazyMeter(
        customer,
        (f) => f.fetchLlmCrossAggregatedMetrics,
      ),
      llmResponse: lazyMeter(customer, (f) => f.fetchLlmResponse),
      keywordVolume: lazyMeter(customer, (f) => f.fetchAiKeywordVolume),
    },
    brandMonitoring: {
      mentions: lazyMeter(customer, (f) => f.fetchBrandMentions),
      summary: lazyMeter(customer, (f) => f.fetchBrandMentionsSummary),
      trends: lazyMeter(customer, (f) => f.fetchBrandMentionTrends),
    },
    domainAnalytics: {
      technologies: lazyMeter(customer, (f) => f.fetchDomainTechnologies),
      whois: lazyMeter(customer, (f) => f.fetchDomainWhois),
    },
  } as const;
}

async function meterDataforseoCall<T>(
  customer: BillingCustomerContext,
  execute: () => Promise<DataforseoApiResponse<T>>,
  creditFeature?: CreditFeature,
): Promise<T> {
  const isHostedMode = await isHostedServerAuthMode();

  if (!isHostedMode) {
    const result = await execute();
    return result.data;
  }

  const billingCustomer = await getOrCreateOrganizationCustomer(customer);

  const { monthlyRemaining } = await assertUsageCreditsAvailable(
    billingCustomer.id,
  );

  let result: DataforseoApiResponse<T>;
  try {
    result = await execute();
  } catch (error) {
    if (error instanceof DataforseoChargedTaskError) {
      // A malformed request (DataForSEO "Invalid Field: ...") that DataForSEO
      // did not bill returns no value to the customer, so don't charge — surface
      // it as a non-reportable VALIDATION_ERROR. If DataForSEO still billed us
      // (costUsd > 0), fall through to the normal charge + capture path so the
      // spend stays metered and visible instead of silently eaten.
      if (error.isInvalidField && error.billing.costUsd <= 0) {
        throw new AppError("VALIDATION_ERROR", error.message);
      }
      await trackDataforseoCost({
        customer,
        customerId: billingCustomer.id,
        billing: error.billing,
        monthlyRemaining,
        creditFeature,
      });
    }
    throw error;
  }

  await trackDataforseoCost({
    customer,
    customerId: billingCustomer.id,
    billing: result.billing,
    monthlyRemaining,
    creditFeature,
  });

  return result.data;
}

async function trackDataforseoCost(args: {
  customer: BillingCustomerContext;
  customerId: string;
  billing: DataforseoApiCallCost;
  monthlyRemaining: number;
  creditFeature?: CreditFeature;
}) {
  await trackUsageCreditSpend({
    customer: args.customer,
    customerId: args.customerId,
    creditFeature:
      args.creditFeature ?? mapDataforseoPathToCreditFeature(args.billing.path),
    costUsd: args.billing.costUsd,
    monthlyRemaining: args.monthlyRemaining,
    properties: {
      provider: "dataforseo",
      paths: [args.billing.path.join("/")],
      fromCache: false,
    },
  });
}
