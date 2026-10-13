import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { getKeywordDataProvider } from "@/shared/keyword-locations";
import type {
  KeywordDifficultyOverviewInput,
  KeywordDifficultyOverviewRow,
} from "@/types/schemas/keywords";
import { keywordDifficultyOverviewRowSchema } from "@/types/schemas/keywords";
import { normalizeIntent, normalizeKeyword } from "./helpers";

/** Difficulty/intent shift slowly; a day keeps repeat page-loads free. */
const DIFFICULTY_OVERVIEW_TTL_SECONDS = 24 * 60 * 60;

const cachedResultSchema = z.object({
  contractVersion: z.literal(2),
  rows: z.array(keywordDifficultyOverviewRowSchema),
});

/**
 * The backend for Task 6's on-demand "Load difficulty for these N"
 * affordance. Keyword difficulty and search intent are Labs-only (see
 * `resolveGeo.ts`'s `NATIONAL_ONLY` set) -- a metro-scoped run's main fetch
 * routes to Google Ads and comes back with `keywordDifficulty: null` for
 * every row (see `fetchKeywordMetricsForList`'s `normalizeAdsKeyword`), and
 * this is the explicit, separate, user-clicked call that backfills it at
 * country level for whatever keywords are on screen right now.
 *
 * `input.locationCode` MUST already be the resolved country-level code (the
 * caller's own `resolveGeo("keyword-difficulty", ...)` output) -- this
 * function refuses a sub-country code outright rather than silently routing
 * it to Google Ads (which has no difficulty/intent to return at all) or
 * silently swapping in a different country the caller never asked for.
 */
export async function getKeywordDifficultyOverview(
  input: KeywordDifficultyOverviewInput,
  billingCustomer: BillingCustomerContext,
): Promise<KeywordDifficultyOverviewRow[]> {
  if (getKeywordDataProvider(input.locationCode) !== "labs") {
    // Reachable only if a caller skips the client-side provider gate
    // (`resolveGeo(...).provider !== "none"`) -- defense in depth, not the
    // expected path. Labs is the sole source for this need; there is no
    // meaningful request to make with a Google-Ads-only location code.
    throw new AppError(
      "VALIDATION_ERROR",
      "Keyword difficulty is not available for this location.",
    );
  }

  const keywords = [...new Set(input.keywords.map(normalizeKeyword))].filter(
    (keyword) => keyword.length > 0,
  );
  if (keywords.length === 0) return [];

  const cacheKey = await buildCacheKey("kw:difficulty-overview", {
    contractVersion: 2,
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cached = cachedResultSchema.safeParse(await getCached(cacheKey));
  if (
    cached.success &&
    cached.data.rows.every(
      (row) =>
        row.source === "DataForSEO Labs" &&
        row.fetchedAt &&
        row.scope?.projectId === input.projectId &&
        row.scope.locationCode === input.locationCode &&
        row.scope.languageCode === input.languageCode,
    )
  ) {
    return cached.data.rows;
  }

  const client = createDataforseoClient(billingCustomer);
  // Loaded lazily to keep the DataForSEO SDK out of the Worker startup graph
  // (the same reason refresh-metrics.ts/RankTrackingService.ts import it
  // this way rather than statically).
  const { fetchKeywordMetricsForList } =
    await import("@/server/lib/dataforseo/keyword-metrics");
  const metrics = await fetchKeywordMetricsForList(client, {
    keywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    creditFeature: "keyword_research",
  });

  const byKeyword = new Map(
    metrics.map((metric) => [normalizeKeyword(metric.keyword), metric]),
  );
  const fetchedAt = new Date().toISOString();
  const rows: KeywordDifficultyOverviewRow[] = keywords.map((keyword) => {
    const metric = byKeyword.get(keyword);
    return {
      keyword,
      keywordDifficulty: metric?.keywordDifficulty ?? null,
      intent: metric?.intent ? normalizeIntent(metric.intent) : null,
      source: "DataForSEO Labs",
      fetchedAt,
      scope: {
        projectId: input.projectId,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
      },
      availability: !metric
        ? "missing"
        : metric.keywordDifficulty === null
          ? "partial"
          : "observed",
    };
  });

  await setCached(
    cacheKey,
    { contractVersion: 2, rows },
    DIFFICULTY_OVERVIEW_TTL_SECONDS,
  ).catch((error) => {
    console.error("keywords.difficulty-overview.cache-write failed:", error);
  });

  return rows;
}
