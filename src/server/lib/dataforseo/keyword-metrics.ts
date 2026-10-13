import type { createDataforseoClient } from "@/server/lib/dataforseo/client";
import type { AdsKeywordItem } from "@/server/lib/dataforseo/google-ads";
import type { KeywordOverviewItem } from "@/server/lib/dataforseo/labs";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { getKeywordDataProvider } from "@/shared/keyword-locations";
import type { MonthlySearch } from "@/types/keywords";
import { providerCount } from "@/shared/provider-observations";
import {
  keywordEstimate,
  keywordRatio,
  keywordScore,
  keywordMonthlySearches,
} from "@/shared/keyword-observations";

type DataforseoClient = ReturnType<typeof createDataforseoClient>;

// Narrowed to the two endpoints the helper uses, so tests can fake it cheaply.
type KeywordMetricsClient = {
  labs: Pick<DataforseoClient["labs"], "keywordOverview">;
  keywords: Pick<DataforseoClient["keywords"], "adsSearchVolume">;
};

// DataForSEO's batch metric endpoints accept up to ~700 keywords per request.
const KEYWORD_METRICS_BATCH_SIZE = 700;

// `intent` is the raw `main_intent` (null for Google Ads); run it through
// `normalizeIntent` for the app enum. `competition` is a 0-1 ratio.
export type KeywordMetricRow = {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  competitionLevel: string | null;
  keywordDifficulty: number | null;
  intent: string | null;
  monthlySearches: MonthlySearch[];
};

function normalizeKeywordOverview(
  item: KeywordOverviewItem,
  keyword: string,
  includeClickstreamData: boolean,
): KeywordMetricRow {
  const info = item.keyword_info;
  // The clickstream-normalized block only exists when the caller opted into
  // clickstream data (it doubles request cost); prefer it when present.
  const clickstreamInfo = item.keyword_info_normalized_with_clickstream;
  const usesClickstream =
    includeClickstreamData &&
    providerCount(clickstreamInfo?.search_volume) !== null;
  return {
    keyword,
    searchVolume: providerCount(
      usesClickstream ? clickstreamInfo?.search_volume : info?.search_volume,
    ),
    cpc: keywordEstimate(info?.cpc),
    competition: keywordRatio(info?.competition),
    competitionLevel: info?.competition_level ?? null,
    keywordDifficulty: keywordScore(
      item.keyword_properties?.keyword_difficulty,
    ),
    intent: item.search_intent_info?.main_intent ?? null,
    monthlySearches: keywordMonthlySearches(
      usesClickstream
        ? clickstreamInfo?.monthly_searches
        : info?.monthly_searches,
    ),
  };
}

// Google Ads items (countries Labs doesn't cover) carry volume/CPC/competition
// but no keyword difficulty or search intent.
function normalizeAdsKeyword(
  item: AdsKeywordItem,
  keyword: string,
): KeywordMetricRow {
  return {
    keyword,
    searchVolume: providerCount(item.search_volume),
    cpc: keywordEstimate(item.cpc),
    // competition_index is a 0-100 scale; the app stores a 0-1 ratio.
    competition:
      keywordScore(item.competition_index) !== null
        ? item.competition_index! / 100
        : null,
    competitionLevel: item.competition ?? null,
    keywordDifficulty: null,
    intent: null,
    monthlySearches: keywordMonthlySearches(item.monthly_searches),
  };
}

// Hydrate a keyword list with fresh metrics: route by location (Labs vs Google
// Ads), batch under the per-call cap, and drop items DataForSEO returns without
// a keyword. `creditFeature` is required so spend is always attributed.
export async function fetchKeywordMetricsForList(
  client: KeywordMetricsClient,
  params: {
    keywords: string[];
    locationCode: number;
    languageCode: string;
    creditFeature: CreditFeature;
    includeClickstreamData?: boolean;
  },
): Promise<KeywordMetricRow[]> {
  const useGoogleAds =
    getKeywordDataProvider(params.locationCode) === "google_ads";
  const rows: KeywordMetricRow[] = [];

  for (let i = 0; i < params.keywords.length; i += KEYWORD_METRICS_BATCH_SIZE) {
    const keywords = params.keywords.slice(i, i + KEYWORD_METRICS_BATCH_SIZE);
    const requested = new Set(
      keywords.map((keyword) => keyword.trim().toLowerCase()),
    );

    if (useGoogleAds) {
      const items = await client.keywords.adsSearchVolume({
        keywords,
        locationCode: params.locationCode,
        languageCode: params.languageCode,
        creditFeature: params.creditFeature,
      });
      for (const item of items) {
        if (!item.keyword || !requested.has(item.keyword.trim().toLowerCase()))
          continue;
        rows.push(normalizeAdsKeyword(item, item.keyword));
      }
    } else {
      const items = await client.labs.keywordOverview({
        keywords,
        locationCode: params.locationCode,
        languageCode: params.languageCode,
        includeClickstreamData: params.includeClickstreamData ?? false,
        creditFeature: params.creditFeature,
      });
      for (const item of items) {
        if (!item.keyword || !requested.has(item.keyword.trim().toLowerCase()))
          continue;
        rows.push(
          normalizeKeywordOverview(
            item,
            item.keyword,
            params.includeClickstreamData ?? false,
          ),
        );
      }
    }
  }

  return rows;
}
