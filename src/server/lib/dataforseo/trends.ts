import { z } from "zod";
import {
  KeywordsDataClickstreamDataDataforseoSearchVolumeLiveRequestInfo,
  KeywordsDataClickstreamDataGlobalSearchVolumeLiveRequestInfo,
  KeywordsDataGoogleTrendsExploreLiveRequestInfo,
} from "dataforseo-client";
import { keywordsDataApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  isRecord,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

// Google Trends interest-over-time and clickstream-based search volume.
// keywords_data results nest trend items under result[0].items (unlike the
// Google Ads endpoints, which return keyword rows directly in `result`).

const trendsGraphPointSchema = z
  .object({
    date_from: z.string().nullable().optional(),
    date_to: z.string().nullable().optional(),
    timestamp: z.number().nullable().optional(),
    missing_data: z.boolean().nullable().optional(),
    values: z.array(z.number().nullable()).nullable().optional(),
  })
  .passthrough();

const trendsGraphItemSchema = z
  .object({
    type: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    keywords: z.array(z.string()).nullable().optional(),
    averages: z.array(z.number().nullable()).nullable().optional(),
    data: z.array(trendsGraphPointSchema).nullable().optional(),
  })
  .passthrough();

export type TrendsGraphItem = z.infer<typeof trendsGraphItemSchema>;

const clickstreamVolumeItemSchema = z
  .object({
    keyword: z.string().nullable().optional(),
    search_volume: z.number().nullable().optional(),
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
  .passthrough();

type ClickstreamVolumeItem = z.infer<typeof clickstreamVolumeItemSchema>;

const globalVolumeItemSchema = z
  .object({
    keyword: z.string().nullable().optional(),
    search_volume: z.number().nullable().optional(),
    country_distribution: z
      .array(
        z
          .object({
            country_iso_code: z.string().nullable().optional(),
            search_volume: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
  })
  .passthrough();

type GlobalVolumeItem = z.infer<typeof globalVolumeItemSchema>;

/** Reads and validates result[0].items for keywords_data trend endpoints. */
function parseResultItems<T extends z.ZodTypeAny>(
  endpoint: string,
  task: { result?: unknown[] },
  itemSchema: T,
): Array<z.infer<T>> {
  const first = task.result?.[0];
  const items = isRecord(first) ? first.items : [];
  const parsed = z.array(itemSchema).safeParse(items ?? []);
  if (!parsed.success) {
    console.error(
      `dataforseo.${endpoint}.invalid-payload`,
      parsed.error.issues.slice(0, 5),
    );
    return [];
  }
  return parsed.data;
}

export async function fetchGoogleTrendsExplore(input: {
  keywords: string[];
  /** Omit for worldwide interest. */
  locationCode?: number;
  languageCode: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<DataforseoApiResponse<TrendsGraphItem[]>> {
  const request = new KeywordsDataGoogleTrendsExploreLiveRequestInfo({
    keywords: input.keywords,
    language_code: input.languageCode,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    item_types: ["google_trends_graph"],
  });
  // The SDK mis-types location_code as string; DataForSEO expects the numeric
  // code on the wire, and the SDK serialises the value as-is.
  Reflect.set(request, "location_code", input.locationCode);
  const response = await keywordsDataApi().googleTrendsExploreLive([request]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: parseResultItems(
      "google-trends-explore-live",
      task,
      trendsGraphItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

export async function fetchClickstreamSearchVolume(input: {
  keywords: string[];
  locationCode: number;
  languageCode: string;
}): Promise<DataforseoApiResponse<ClickstreamVolumeItem[]>> {
  const response =
    await keywordsDataApi().clickstreamDataDataforseoSearchVolumeLive([
      new KeywordsDataClickstreamDataDataforseoSearchVolumeLiveRequestInfo({
        keywords: input.keywords,
        location_code: input.locationCode,
        language_code: input.languageCode,
        use_clickstream: true,
      }),
    ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: parseResultItems(
      "clickstream-dataforseo-search-volume-live",
      task,
      clickstreamVolumeItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

export async function fetchGlobalSearchVolume(input: {
  keywords: string[];
}): Promise<DataforseoApiResponse<GlobalVolumeItem[]>> {
  const response =
    await keywordsDataApi().clickstreamDataGlobalSearchVolumeLive([
      new KeywordsDataClickstreamDataGlobalSearchVolumeLiveRequestInfo({
        keywords: input.keywords,
      }),
    ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: parseResultItems(
      "clickstream-global-search-volume-live",
      task,
      globalVolumeItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}
