import type { BillingCustomerContext } from "@/server/billing/subscription";
import { getKeywordsPage } from "@/server/features/domain/services/domainKeywordsPage";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { buildCacheKey, setCached } from "@/server/lib/r2-cache";
import type {
  KeywordDiscoveryResult,
  KeywordDiscoveryKeyword,
} from "@/types/schemas/keyword-discovery";
import type { StoredMetricGeo } from "@/types/schemas/geo";
import { STORED_GEO_BUNDLE_VERSION } from "@/types/schemas/geo";

/**
 * The Keyword Trends tab's one paid call.
 *
 * A thin caller rather than a new provider integration: `getKeywordsPage`
 * already fetches, maps, filters and caches Labs ranked_keywords for Domain
 * Overview. What is new here is (a) asking for one big page instead of a
 * paginated slice and (b) RECORDING the attempt, which is what lets the tab
 * auto-run exactly once.
 *
 * Deliberately not routed through Domain Overview's own server function: that
 * endpoint carries a tab's pagination/sort/filter arguments, records no run,
 * and is consumed behind `useMeteredQuery`'s authorize gate. This tab opens
 * that gate without a click, and widening the shared endpoint to allow it
 * would remove the protection from the tab that still needs it.
 */

/** One page, not a paginated table: the user asked for a list of 50-100.
 *  100 is already one of `DOMAIN_KEYWORDS_PAGE_SIZES` ([50, 100, 200]), so
 *  this asks the shared service for nothing it does not already serve. */
const DISCOVERY_PAGE_SIZE = 100;

export type KeywordDiscoveryInput = {
  projectId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  /** Captured at run time by the client and persisted verbatim, so a restored
   *  table is labeled with the scope it was fetched under. Never read back to
   *  decide anything about THIS request. */
  geo: StoredMetricGeo;
};

export async function runKeywordDiscovery(
  input: KeywordDiscoveryInput,
  billingCustomer: BillingCustomerContext,
): Promise<KeywordDiscoveryResult> {
  const params = {
    domain: input.domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    geo: { v: STORED_GEO_BUNDLE_VERSION, rankings: input.geo },
  };

  try {
    const page = await getKeywordsPage(
      {
        projectId: input.projectId,
        domain: input.domain,
        includeSubdomains: false,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        page: 1,
        pageSize: DISCOVERY_PAGE_SIZE,
        sortMode: "traffic",
        sortOrder: "desc",
        filters: {},
      },
      billingCustomer,
    );

    const keywords: KeywordDiscoveryKeyword[] = page.keywords.map((row) => ({
      keyword: row.keyword,
      position: row.position,
      searchVolume: row.searchVolume,
      traffic: row.traffic,
      cpc: row.cpc,
      url: row.url,
      relativeUrl: row.relativeUrl,
      keywordDifficulty: row.keywordDifficulty,
    }));

    const result: KeywordDiscoveryResult = {
      status: "ok",
      domain: page.domain,
      fetchedAt: page.fetchedAt,
      keywords,
    };

    await recordDiscoveryRun(input, params, result, billingCustomer);
    return result;
  } catch (error) {
    // RECORD THE FAILURE, then rethrow.
    //
    // Without this row the tab's guard sees "no run has ever happened" on the
    // next mount and fires the paid call again -- forever, for any project
    // that is out of credits or hitting a provider outage. DataForSEO can
    // charge for a task that subsequently errors (see DataforseoChargedTaskError),
    // so those repeats are not free. Recording turns an unbounded loop into one
    // attempt plus a retry button.
    const result: KeywordDiscoveryResult = {
      status: "failed",
      reason: describeFailure(error),
      attemptedAt: new Date().toISOString(),
    };
    await recordDiscoveryRun(input, params, result, billingCustomer);
    throw error;
  }
}

/**
 * Records the attempt under its own cache key.
 *
 * `AnalysisRunService.record` copies whatever sits at `cacheKey` into the
 * durable `analysis-runs/` prefix, so the payload has to be written first --
 * including for a failure, which has no provider response of its own to reuse.
 */
async function recordDiscoveryRun(
  input: KeywordDiscoveryInput,
  params: Record<string, unknown>,
  result: KeywordDiscoveryResult,
  billingCustomer: BillingCustomerContext,
): Promise<void> {
  const cacheKey = await buildCacheKey("keyword-discovery:run", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    domain: input.domain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    attemptedAt:
      result.status === "failed" ? result.attemptedAt : result.fetchedAt,
  });

  await setCached(cacheKey, result, DISCOVERY_RUN_TTL_SECONDS).catch(
    (error) => {
      console.error("keyword-discovery.cache-write failed:", error);
    },
  );

  await AnalysisRunService.record({
    projectId: input.projectId,
    feature: RUN_FEATURES.keywordDiscovery,
    params,
    cacheKey,
    label: input.domain,
  });
}

/** The soft TTL on the shared cache copy. The DURABLE copy lives under the
 *  `analysis-runs/` prefix and is what a restore actually reads, so this only
 *  governs the short-lived cache object. */
const DISCOVERY_RUN_TTL_SECONDS = 12 * 60 * 60;

/** A short tag safe to render. Never the raw provider message, which can carry
 *  account identifiers and endpoint detail. */
function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/credit/i.test(message)) return "insufficient_credits";
  if (/rate|429/i.test(message)) return "rate_limited";
  return "provider_error";
}
