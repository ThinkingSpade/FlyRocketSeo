import {
  KeywordsDataGoogleAdsKeywordsForKeywordsLiveRequestInfo,
  KeywordsDataGoogleAdsSearchVolumeLiveRequestInfo,
  type KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo,
  type KeywordsDataGoogleAdsSearchVolumeLiveResultInfo,
} from "dataforseo-client";
import { keywordsDataApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  isNoResultsTask,
  type DataforseoTaskLike,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import { assertKeywordScope, rejectLabsContract } from "./labs-contract";
import { z } from "zod";

// Google Ads keyword data for countries DataForSEO Labs doesn't cover (see
// specs/0004-keyword-data-source-routing.md). Flat-priced per request; items
// carry volume / CPC / competition but no keyword difficulty or intent.
export type AdsKeywordItem = KeywordsDataGoogleAdsSearchVolumeLiveResultInfo;
export type AdsKeywordIdeaItem =
  KeywordsDataGoogleAdsKeywordsForKeywordsLiveResultInfo;

function taskItems<T>(
  task: DataforseoTaskLike & { result?: T[] },
  scope: { locationCode: number; languageCode: string; keywords?: string[] },
  exactKeywords = false,
): T[] {
  // keywords_data tasks return keyword items directly in `result` (no nested
  // `items` wrapper like Labs).
  if (isNoResultsTask(task)) return [];
  if (!Array.isArray(task.result))
    rejectLabsContract(task, "missing Ads results");
  const schema = z.array(
    z
      .object({
        keyword: z.string().nullable().optional(),
        search_volume: z.number().nullable().optional(),
        cpc: z.number().nullable().optional(),
        competition_index: z.number().nullable().optional(),
        monthly_searches: z
          .array(
            z
              .object({
                year: z.number().nullable().optional(),
                month: z.number().nullable().optional(),
                search_volume: z.number().nullable().optional(),
              })
              .passthrough(),
          )
          .nullable()
          .optional(),
      })
      .passthrough(),
  );
  if (!schema.safeParse(task.result).success)
    rejectLabsContract(task, "invalid Ads items");
  for (const item of task.result)
    assertKeywordScope(task, item, scope, exactKeywords);
  return task.result;
}

export async function fetchAdsSearchVolume(input: {
  keywords: string[];
  locationCode: number;
  languageCode: string;
}): Promise<DataforseoApiResponse<AdsKeywordItem[]>> {
  const response = await keywordsDataApi().googleAdsSearchVolumeLive([
    new KeywordsDataGoogleAdsSearchVolumeLiveRequestInfo({
      keywords: input.keywords,
      location_code: input.locationCode,
      language_code: input.languageCode,
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: taskItems(task, input, true),
    billing: buildTaskBilling(task),
  };
}

export async function fetchAdsKeywordIdeas(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  limit: number;
}): Promise<DataforseoApiResponse<AdsKeywordIdeaItem[]>> {
  const response = await keywordsDataApi().googleAdsKeywordsForKeywordsLive([
    new KeywordsDataGoogleAdsKeywordsForKeywordsLiveRequestInfo({
      keywords: [input.keyword],
      location_code: input.locationCode,
      language_code: input.languageCode,
      sort_by: "search_volume",
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  // The endpoint has no limit parameter (it can return thousands of
  // suggestions for one flat fee); truncate to what the caller asked for.
  return {
    data: taskItems(task, input).slice(0, input.limit),
    billing: buildTaskBilling(task),
  };
}
