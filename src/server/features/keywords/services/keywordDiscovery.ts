import type { BillingCustomerContext } from "@/server/billing/subscription";
import { getKeywordsPage } from "@/server/features/domain/services/domainKeywordsPage";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import { buildCacheKey, setCached } from "@/server/lib/r2-cache";
import { asAppError } from "@/server/lib/errors";
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

type KeywordDiscoveryInput = {
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
    // Log the RAW error here, and ONLY here. `describeFailure` below
    // deliberately collapses every failure to one of three fixed tags
    // because the raw DataForSEO `status_message` can carry account
    // identifiers -- and that classified tag is the only thing that reaches
    // `reason`, which is PERSISTED and read back by the client. A
    // `console.error` is not part of that path: nothing reads server logs
    // over the wire, so there is no leak here, and this line is the only
    // remaining way to tell an out-of-funds account apart from a malformed
    // request or a vendor outage -- `assertOk` (dataforseo/envelope.ts)
    // throws the exact same `AppError("INTERNAL_ERROR", task.status_message)`
    // shape for all three. Without this line, a real prod failure is
    // undiagnosable: the persisted record (and everything derived from it)
    // shows nothing beyond the fixed tag "provider_error". Prefixed like
    // this file's other log lines (`keyword-discovery.*`) so `wrangler tail`
    // output stays greppable.
    console.error(
      `keyword-discovery.provider-error project=${input.projectId} domain=${input.domain}:`,
      error,
    );

    // RECORD THE FAILURE, then rethrow.
    //
    // Without this row the tab's guard sees "no run has ever happened" on the
    // next mount and fires the paid call again -- forever, for any project
    // that is out of credits or hitting a provider outage. DataForSEO can
    // charge for a task that subsequently errors (see DataforseoChargedTaskError),
    // so those repeats are not free. Recording turns an unbounded loop into one
    // attempt plus a retry button -- FOR AS LONG AS THE ROW ACTUALLY LANDS,
    // which is why `recordDiscoveryRun` no longer routes through
    // `AnalysisRunService.record` (whose whole body is a swallowing
    // try/catch). See its own comment for what it does instead, and for the
    // one residual gap it cannot close.
    const result: KeywordDiscoveryResult = {
      status: "failed",
      reason: describeFailure(error),
      // Same classification `describeFailure` already computed, kept as the
      // actual code rather than the collapsed tag -- see this field's own
      // comment in keyword-discovery.ts for why that's still safe to store.
      // "unknown" (not the code) when `error` wasn't a recognised `AppError`
      // at all, which `describeFailure` also folds into "provider_error".
      diagnostic: asAppError(error)?.code ?? "unknown",
      attemptedAt: new Date().toISOString(),
    };
    // Rethrows the PROVIDER error, never a recording error: the provider
    // error is the cause, and `describeFailure` has already classified it for
    // the user. A recording failure has been logged by the time this runs.
    await recordDiscoveryRun(input, params, result, billingCustomer);
    throw error;
  }
}

/**
 * Records the attempt under its own cache key, and verifies the row landed.
 *
 * `recordOrThrow` rather than `record`, and that choice is the whole point of
 * this function. `AnalysisRunService.record` is best-effort by design --
 * `try { ... } catch { console.error }` around its whole body -- so before
 * this, a D1 write failure silently produced exactly the unbounded re-billing
 * loop the caller above promises is prevented. The invariant was asserted in
 * one file and discarded in another.
 *
 * A failed write is RETRIED once. The repository's insert is an upsert on
 * (projectId, feature, cacheKey), so a retry after a lost response bumps
 * `runCount` at worst -- it cannot duplicate the row, and `runCount` is
 * display-only. A transient D1 blip is the realistic failure mode here, and
 * one retry converts most of them into a landed guard.
 *
 * THE RESIDUAL GAP, stated rather than papered over: if both attempts fail on
 * the SUCCESS path, this still returns the result. Throwing instead would not
 * close the loop -- the row is equally absent either way, so the next mount
 * re-fires regardless -- it would only additionally throw away data the user
 * has already been billed for. So the honest end state is: deliver the data,
 * and log `keyword-discovery.guard-not-recorded` loudly enough to be found,
 * because that log line is the only evidence that the run-once guarantee is
 * not currently holding for that project.
 *
 * `AnalysisRunService.recordOrThrow` copies whatever sits at `cacheKey` into
 * the durable `analysis-runs/` prefix, so the payload has to be written first
 * -- including for a failure, which has no provider response of its own to
 * reuse.
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

  const row = {
    projectId: input.projectId,
    feature: RUN_FEATURES.keywordDiscovery,
    params,
    cacheKey,
    label: input.domain,
  };

  try {
    await AnalysisRunService.recordOrThrow(row);
  } catch (first) {
    console.error("keyword-discovery.guard-write failed, retrying:", first);
    try {
      await AnalysisRunService.recordOrThrow(row);
    } catch (second) {
      // The one log line that says the run-once guarantee is not holding for
      // this project. Not rethrown -- see this function's own doc comment for
      // why throwing here would cost the user their paid data without closing
      // the loop.
      console.error(
        `keyword-discovery.guard-not-recorded project=${input.projectId} -- the paid run-once guard did not land and this project may be billed again:`,
        second,
      );
    }
  }
}

/** The soft TTL on the shared cache copy. The DURABLE copy lives under the
 *  `analysis-runs/` prefix and is what a restore actually reads, so this only
 *  governs the short-lived cache object. */
const DISCOVERY_RUN_TTL_SECONDS = 12 * 60 * 60;

/**
 * A short tag safe to render. Never the raw provider message, which can carry
 * account identifiers and endpoint detail.
 *
 * Classifies by `AppError.code`, NOT by matching text in `error.message`.
 * An earlier version of this function ran `/credit/i` and `/rate|429/i`
 * against `error.message` and happened to work: `new AppError(
 * "INSUFFICIENT_CREDITS")` defaults its `.message` to the code string
 * (errors.ts), which happens to contain "CREDIT", and DataForSEO's
 * HTTP-status AppError happens to format its message as `DataForSEO HTTP 429
 * on ${path}` (dataforseo/core.ts), which happens to contain "429". Both were
 * accidents of the current message wording, not a contract -- a copy edit to
 * either message would silently stop the match and misclassify every
 * subsequent failure as "provider_error". `code` IS the contract (see
 * ErrorCode in shared/error-codes.ts), so read that instead. This is the same
 * pattern used to detect insufficient credits elsewhere in the codebase (e.g.
 * serverFunctions/rank-tracking.ts, ai-search/services/brandLookup.ts):
 * `error instanceof AppError && error.code === "INSUFFICIENT_CREDITS"`.
 *
 * `asAppError` additionally recognises an error whose `.message` IS itself a
 * valid error code -- the shape an error takes after crossing
 * `toClientError`'s client boundary (errors.ts) -- so this keeps working if
 * this call site ever ends up behind one, without needing a second check.
 */
function describeFailure(error: unknown): string {
  const appError = asAppError(error);
  if (appError?.code === "INSUFFICIENT_CREDITS") return "insufficient_credits";
  if (appError?.code === "RATE_LIMITED") return "rate_limited";
  return "provider_error";
}
