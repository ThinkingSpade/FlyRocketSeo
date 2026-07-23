import { AppError } from "@/server/lib/errors";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import {
  CACHE_TTL,
  buildCacheKey,
  getCached,
  setCached,
} from "@/server/lib/r2-cache";
import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import type { KeywordResearchRow } from "@/types/keywords";
import type { ResearchKeywordsInput } from "@/types/schemas/keywords";
import { getKeywordDataProvider } from "@/shared/keyword-locations";
import { type EnrichedKeyword, normalizeKeyword } from "./helpers";
import {
  RELATED_KEYWORDS_DEPTH,
  fetchGoogleAdsResearchRows,
  fetchResearchRowsBySource,
} from "./research-data";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import {
  AUTO_KEYWORD_SOURCES,
  MIN_NON_SEED_FOR_AUTO,
  countNonSeedKeywords,
  countRelevantKeywords,
  hasSufficientCoverage,
  type KeywordMode,
  type KeywordSource,
  type ResearchSource,
} from "./selection";

type SourceAttempt = {
  source: ResearchSource;
  rowCount: number;
  nonSeedCount: number;
  /** Absent on runs stored before this field existed; every new run sets it. */
  relevantCount?: number;
};

type ResearchDiagnostics = {
  requestedMode: KeywordMode;
  threshold: number;
  sourceAttempts: SourceAttempt[];
};

type ResearchResult = {
  rows: KeywordResearchRow[];
  source: ResearchSource;
  usedFallback: boolean;
  diagnostics: ResearchDiagnostics;
};

type CachedResult = ResearchResult;

import { keywordResearchResultSchema as cachedResultSchema } from "@/types/schemas/keywords";

// v4: Auto tries suggestions before related and related walks one hop, so the
// same request no longer returns the drifted rows a v3 entry cached.
const CACHE_VERSION = 4;

async function fetchRowsFromSource(
  source: KeywordSource,
  input: ResearchKeywordsInput,
  seedKeyword: string,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<EnrichedKeyword[]> {
  return fetchResearchRowsBySource(
    {
      source,
      seedKeyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      resultLimit: input.resultLimit,
      includeClickstreamData: input.clickstream,
      creditFeature,
    },
    billingCustomer,
  );
}

async function fetchAutoRows(
  input: ResearchKeywordsInput,
  seedKeyword: string,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<ResearchResult> {
  const attempts: SourceAttempt[] = [];
  let lastSource: KeywordSource = "related";
  const accumulatedRows: EnrichedKeyword[] = [];
  const seenKeywords = new Set<string>();

  for (const source of AUTO_KEYWORD_SOURCES) {
    const rows = await fetchRowsFromSource(
      source,
      input,
      seedKeyword,
      billingCustomer,
      creditFeature,
    );
    for (const row of rows) {
      if (accumulatedRows.length >= input.resultLimit) break;
      if (seenKeywords.has(row.keyword)) continue;
      seenKeywords.add(row.keyword);
      accumulatedRows.push(row);
    }

    attempts.push({
      source,
      rowCount: rows.length,
      nonSeedCount: countNonSeedKeywords(rows, seedKeyword),
      relevantCount: countRelevantKeywords(rows, seedKeyword),
    });

    lastSource = source;

    // Coverage counts RELEVANT rows, so a source can fill the result limit
    // with rows that are mostly off-topic and still leave coverage false.
    // Without this the loop would pay for the next source and then discard
    // every row it returned, because there is no room left to accumulate.
    const full = accumulatedRows.length >= input.resultLimit;

    if (
      full ||
      hasSufficientCoverage(accumulatedRows, seedKeyword, MIN_NON_SEED_FOR_AUTO)
    ) {
      return {
        rows: accumulatedRows,
        source,
        usedFallback: source !== AUTO_KEYWORD_SOURCES[0],
        diagnostics: {
          requestedMode: "auto",
          threshold: MIN_NON_SEED_FOR_AUTO,
          sourceAttempts: attempts,
        },
      };
    }
  }

  return {
    rows: accumulatedRows,
    source: lastSource,
    usedFallback: true,
    diagnostics: {
      requestedMode: "auto",
      threshold: MIN_NON_SEED_FOR_AUTO,
      sourceAttempts: attempts,
    },
  };
}

async function fetchGoogleAdsRows(
  input: ResearchKeywordsInput,
  seedKeyword: string,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<ResearchResult> {
  const rows = await fetchGoogleAdsResearchRows(
    {
      seedKeyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      resultLimit: input.resultLimit,
      creditFeature,
    },
    billingCustomer,
  );

  return {
    rows,
    source: "google_ads",
    usedFallback: false,
    diagnostics: {
      requestedMode: "auto",
      threshold: MIN_NON_SEED_FOR_AUTO,
      sourceAttempts: [
        {
          source: "google_ads",
          rowCount: rows.length,
          nonSeedCount: countNonSeedKeywords(rows, seedKeyword),
          relevantCount: countRelevantKeywords(rows, seedKeyword),
        },
      ],
    },
  };
}

async function fetchManualRows(
  mode: Exclude<KeywordMode, "auto">,
  input: ResearchKeywordsInput,
  seedKeyword: string,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<ResearchResult> {
  const rows = await fetchRowsFromSource(
    mode,
    input,
    seedKeyword,
    billingCustomer,
    creditFeature,
  );
  const attempt: SourceAttempt = {
    source: mode,
    rowCount: rows.length,
    nonSeedCount: countNonSeedKeywords(rows, seedKeyword),
    relevantCount: countRelevantKeywords(rows, seedKeyword),
  };

  return {
    rows,
    source: mode,
    usedFallback: false,
    diagnostics: {
      requestedMode: mode,
      threshold: MIN_NON_SEED_FOR_AUTO,
      sourceAttempts: [attempt],
    },
  };
}

async function buildResearchCacheKey(
  input: ResearchKeywordsInput,
  normalizedKeywords: string[],
  mode: KeywordMode,
  billingCustomer: BillingCustomerContext,
): Promise<string> {
  return buildCacheKey("kw:research", {
    cacheVersion: CACHE_VERSION,
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keywords: normalizedKeywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    resultLimit: input.resultLimit,
    mode,
    depth: RELATED_KEYWORDS_DEPTH,
    clickstream: input.clickstream,
  });
}

function persistRows(input: ResearchKeywordsInput, rows: EnrichedKeyword[]) {
  void Promise.all(
    rows.map((row) =>
      KeywordResearchRepository.upsertKeywordMetric({
        projectId: input.projectId,
        keyword: row.keyword,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        searchVolume: row.searchVolume,
        cpc: row.cpc,
        competition: row.competition,
        keywordDifficulty: row.keywordDifficulty,
        intent: row.intent,
        monthlySearchesJson: JSON.stringify(row.trend),
      }),
    ),
  ).catch((error) => {
    console.error("keywords.research.persist-metrics failed:", error);
  });
}

export async function research(
  input: ResearchKeywordsInput,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<ResearchResult> {
  const uniqueKeywords = [
    ...new Set(input.keywords.map(normalizeKeyword)),
  ].filter((keyword) => keyword.length > 0);

  if (uniqueKeywords.length === 0) {
    throw new AppError("VALIDATION_ERROR");
  }

  const seedKeyword = uniqueKeywords[0];
  const provider = getKeywordDataProvider(input.locationCode);
  // Labs source modes and clickstream refinement don't exist for
  // Google-Ads-served countries; collapse both so equivalent requests share
  // one cache entry.
  const effectiveInput: ResearchKeywordsInput =
    provider === "google_ads"
      ? { ...input, mode: "auto", clickstream: false }
      : input;
  const mode = effectiveInput.mode ?? "auto";
  const cacheKey = await buildResearchCacheKey(
    effectiveInput,
    uniqueKeywords,
    mode,
    billingCustomer,
  );

  // Records this analysis for the tab's history / auto-restore. Free and best
  // effort: one row pointing at the cache key this result already lives under.
  const recordRun = () =>
    AnalysisRunService.record({
      projectId: effectiveInput.projectId,
      feature: RUN_FEATURES.keywordResearch,
      params: {
        keywords: uniqueKeywords,
        locationCode: effectiveInput.locationCode,
        languageCode: effectiveInput.languageCode,
        resultLimit: effectiveInput.resultLimit,
        mode,
        clickstream: effectiveInput.clickstream,
      },
      cacheKey,
      label: uniqueKeywords.join(", "),
    });

  const cachedRaw = await getCached(cacheKey);
  const cachedResult = cachedResultSchema.safeParse(cachedRaw);
  const cached: CachedResult | null = cachedResult.success
    ? cachedResult.data
    : null;

  if (cached && cached.rows.length > 0) {
    await recordRun();
    return cached;
  }

  const result =
    provider === "google_ads"
      ? await fetchGoogleAdsRows(
          effectiveInput,
          seedKeyword,
          billingCustomer,
          creditFeature,
        )
      : mode === "auto"
        ? await fetchAutoRows(
            effectiveInput,
            seedKeyword,
            billingCustomer,
            creditFeature,
          )
        : await fetchManualRows(
            mode,
            effectiveInput,
            seedKeyword,
            billingCustomer,
            creditFeature,
          );

  await setCached(cacheKey, result, CACHE_TTL.researchResult);
  persistRows(effectiveInput, result.rows);
  if (result.rows.length > 0) await recordRun();

  return result;
}
