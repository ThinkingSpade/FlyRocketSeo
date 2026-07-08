import {
  AiOptimizationAiKeywordDataKeywordsSearchVolumeLiveRequestInfo,
  type AiOptimizationAiKeywordDataKeywordsSearchVolumeLiveItem,
} from "dataforseo-client";
import { aiOptimizationApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

type AiKeywordVolumeItem =
  AiOptimizationAiKeywordDataKeywordsSearchVolumeLiveItem;

/** Estimated volume of a keyword appearing in AI assistant prompts. */
export async function fetchAiKeywordVolume(input: {
  keywords: string[];
  locationCode: number;
  languageCode: string;
}): Promise<DataforseoApiResponse<AiKeywordVolumeItem[]>> {
  const response =
    await aiOptimizationApi().aiKeywordDataKeywordsSearchVolumeLive([
      new AiOptimizationAiKeywordDataKeywordsSearchVolumeLiveRequestInfo({
        keywords: input.keywords,
        location_code: input.locationCode,
        language_code: input.languageCode,
      }),
    ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}
