import { sortBy } from "remeda";
import {
  CHATGPT_LANGUAGE_CODE,
  CHATGPT_LOCATION_CODE,
} from "@/server/lib/dataforseoAiTarget";
import type { LlmPlatform } from "@/server/lib/dataforseo/ai";
import type {
  LlmAggregatedTotal,
  LlmMentionItem,
  LlmTopPagesItem,
} from "@/server/lib/dataforseoLlmSchemas";
import { safeHostname, safeHttpUrl } from "@/server/features/ai-search/safeUrl";
import { deriveCitedSources } from "@/server/features/ai-search/services/citedSources";
import {
  computeShareOfVoice,
  roundOrNull,
  sumNullable,
  type CrossOutcome,
} from "@/server/features/ai-search/services/shareOfVoice";
import type { BrandLookupResult } from "@/types/schemas/ai-search";
import type { detectTarget } from "@/shared/targetDetection";
import {
  providerCount,
  providerTimestamp,
} from "@/shared/provider-observations";

const TOP_QUERIES_PER_PLATFORM = 25;
const TOP_SOURCES_PER_PLATFORM = 10;
const KEYWORDS_PER_SOURCE = 50;
const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 300;
const MAX_QUESTION_LENGTH = 500;
const MAX_BRAND_ENTITY_LENGTH = 200;

export type PlatformBundle = {
  aggregated: LlmAggregatedTotal;
  topPages: LlmTopPagesItem[];
  mentions: LlmMentionItem[];
  /** False when one of the sub-calls failed and fell back to empty data. */
  complete: boolean;
};

export type PlatformOutcome = {
  platform: LlmPlatform;
  status: "success" | "error";
  bundle: PlatformBundle | null;
};

export type ShapeArgs = {
  query: string;
  detected: ReturnType<typeof detectTarget>;
  platformBundles: PlatformOutcome[];
  crossOutcomes: CrossOutcome[];
  /** Labels of the resolved competitor groups, as sent to cross_aggregated. */
  competitorKeys: string[];
  userLocationCode: number;
  userLanguageCode: string;
};

export function shapeResult(args: ShapeArgs): BrandLookupResult {
  const successfulBundles = args.platformBundles.filter(
    (b): b is PlatformOutcome & { bundle: PlatformBundle } =>
      b.status === "success" && b.bundle !== null,
  );

  const primaryLanguage = args.userLanguageCode.toLowerCase().split(/[-_]/)[0];
  const chatGptLocaleMatches =
    args.userLocationCode === CHATGPT_LOCATION_CODE &&
    primaryLanguage === CHATGPT_LANGUAGE_CODE;

  const perPlatform = args.platformBundles.map((outcome) => {
    if (outcome.status === "error" || !outcome.bundle) {
      return {
        platform: outcome.platform,
        status: "error" as const,
        mentions: null,
        aiSearchVolume: null,
      };
    }
    const matchingGroups = outcome.bundle.aggregated.platform?.filter(
      (entry) => entry.key === outcome.platform,
    );
    const platformGroup =
      matchingGroups?.length === 1 ? matchingGroups[0] : undefined;
    return {
      platform: outcome.platform,
      status: "success" as const,
      mentions: roundOrNull(platformGroup?.mentions),
      aiSearchVolume: roundOrNull(platformGroup?.ai_search_volume),
    };
  });

  const aggregatablePlatforms = perPlatform.filter(
    (p) => chatGptLocaleMatches || p.platform !== "chat_gpt",
  );
  const totalMentions = aggregatablePlatforms.every((p) => p.mentions !== null)
    ? sumNullable(aggregatablePlatforms.map((p) => p.mentions))
    : null;
  const totalAiSearchVolume = aggregatablePlatforms.every(
    (p) => p.aiSearchVolume !== null,
  )
    ? sumNullable(aggregatablePlatforms.map((p) => p.aiSearchVolume))
    : null;

  const topPages = deriveCitedSources(
    successfulBundles.map((bundle) => ({
      platform: bundle.platform,
      topPages: bundle.bundle.topPages,
      mentions: bundle.bundle.mentions,
    })),
    {
      sourcesPerPlatform: TOP_SOURCES_PER_PLATFORM,
      keywordsPerSource: KEYWORDS_PER_SOURCE,
    },
  );

  const topQueries = shapeTopQueries(successfulBundles);
  const trendBundles = chatGptLocaleMatches
    ? successfulBundles
    : successfulBundles.filter((b) => b.platform !== "chat_gpt");
  const monthlyVolume = aggregateMonthlyVolume(trendBundles);
  const shareOfVoice = computeShareOfVoice(
    chatGptLocaleMatches
      ? args.crossOutcomes
      : args.crossOutcomes.filter((outcome) => outcome.platform !== "chat_gpt"),
    args.detected.value,
    args.competitorKeys,
  );

  const hasData =
    totalMentions !== null ||
    totalAiSearchVolume !== null ||
    topPages.length > 0 ||
    topQueries.length > 0 ||
    monthlyVolume.length > 0 ||
    (shareOfVoice?.entries.some((e) => e.mentions != null) ?? false);

  return {
    query: args.query,
    contractVersion: 2,
    source: "DataForSEO AI Optimization",
    scope: {
      locationCode: args.userLocationCode,
      languageCode: args.userLanguageCode,
    },
    detectedTargetType: args.detected.type,
    resolvedTarget: args.detected.value,
    fetchedAt: new Date().toISOString(),
    hasData,
    // Reported, not just used for the cache decision. A bundle that swallowed a
    // rejected sub-call into an empty array is renderable but incomplete, and
    // the UI must not turn that into "no mentions found".
    partialPlatforms: successfulBundles
      .filter(
        (b) =>
          !b.bundle.complete ||
          !b.bundle.aggregated.platform?.some(
            (entry) =>
              entry.key === b.platform &&
              providerCount(entry.mentions) !== null &&
              providerCount(entry.ai_search_volume) !== null,
          ),
      )
      .map((b) => b.platform),
    totalMentions,
    totalAiSearchVolume,
    perPlatform,
    shareOfVoice,
    topPages,
    topQueries,
    monthlyVolume,
  };
}

function shapeTopQueries(
  bundles: Array<PlatformOutcome & { bundle: PlatformBundle }>,
): BrandLookupResult["topQueries"] {
  return sortBy(
    bundles.flatMap((bundle) =>
      sortBy(
        bundle.bundle.mentions
          .filter(
            (item): item is LlmMentionItem & { question: string } =>
              typeof item.question === "string" && item.question.length > 0,
          )
          .map((item) => ({
            question: truncate(item.question, MAX_QUESTION_LENGTH),
            platform: bundle.platform,
            aiSearchVolume: roundOrNull(item.ai_search_volume),
            firstSeenAt: providerTimestamp(item.first_response_at),
            lastSeenAt: providerTimestamp(item.last_response_at),
            citedSources: shapeQuerySources(item),
            brandsMentioned: (item.brand_entities ?? [])
              .map((entity) => entity.title ?? "")
              .filter((title) => title.length > 0)
              .map((title) => truncate(title, MAX_BRAND_ENTITY_LENGTH))
              .slice(0, 20),
          })),
        [(query) => query.aiSearchVolume ?? 0, "desc"],
      ).slice(0, TOP_QUERIES_PER_PLATFORM),
    ),
    [(query) => query.aiSearchVolume ?? 0, "desc"],
  );
}

function shapeQuerySources(
  item: LlmMentionItem,
): BrandLookupResult["topQueries"][number]["citedSources"] {
  return (item.sources ?? [])
    .map((src) => {
      const safeUrl = safeHttpUrl(src.url);
      if (!safeUrl || safeUrl.length > MAX_URL_LENGTH) return null;
      return {
        url: safeUrl,
        domain: safeHostname(safeUrl),
        title:
          typeof src.title === "string"
            ? truncate(src.title, MAX_TITLE_LENGTH)
            : null,
      };
    })
    .filter((src): src is NonNullable<typeof src> => src !== null)
    .slice(0, 10);
}

function aggregateMonthlyVolume(
  bundles: Array<PlatformOutcome & { bundle: PlatformBundle }>,
): BrandLookupResult["monthlyVolume"] {
  const sampledPrompts = bundles.flatMap((outcome) => outcome.bundle.mentions);
  const totals = new Map<string, number | null>();
  for (const mention of sampledPrompts) {
    for (const monthly of mention.monthly_searches ?? []) {
      if (
        !Number.isInteger(monthly.year) ||
        monthly.year < 1970 ||
        monthly.year > 9999 ||
        !Number.isInteger(monthly.month) ||
        monthly.month < 1 ||
        monthly.month > 12
      )
        continue;
      const key = `${monthly.year}-${monthly.month}`;
      const observed = providerCount(monthly.search_volume);
      const previous = totals.get(key);
      totals.set(
        key,
        observed === null || previous === null
          ? null
          : providerCount((previous ?? 0) + observed),
      );
    }
  }
  const entries = Array.from(totals.entries()).map(([key, volume]) => {
    const [yearStr, monthStr] = key.split("-");
    const complete = sampledPrompts.every((prompt) => {
      const matches = (prompt.monthly_searches ?? []).filter(
        (month) =>
          month.year === Number(yearStr) && month.month === Number(monthStr),
      );
      return (
        matches.length === 1 && providerCount(matches[0].search_volume) !== null
      );
    });
    return {
      year: Number(yearStr),
      month: Number(monthStr),
      volume: complete ? volume : null,
    };
  });

  return sortBy(
    entries,
    [(entry) => entry.year, "asc"],
    [(entry) => entry.month, "asc"],
  ).slice(-12);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}
