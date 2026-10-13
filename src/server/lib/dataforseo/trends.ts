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
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import {
  assertGlobalVolumeKeywords,
  assertTrendsGraphColumns,
  parseTrendsItems,
} from "./trends-contract";
import {
  trendsCalendarDateSchema,
  trendsInterestSchema,
} from "@/types/schemas/trends";

// Google Trends interest-over-time and clickstream-based search volume.
// keywords_data results nest trend items under result[0].items (unlike the
// Google Ads endpoints, which return keyword rows directly in `result`).

const trendsGraphPointSchema = z
  .object({
    date_from: trendsCalendarDateSchema.nullable().optional(),
    date_to: trendsCalendarDateSchema.nullable().optional(),
    timestamp: z
      .number()
      .int()
      .nonnegative()
      .max(253402300799)
      .nullable()
      .optional(),
    missing_data: z.boolean().nullable().optional(),
    values: z.array(trendsInterestSchema).nullable().optional(),
  })
  .passthrough()
  .refine(
    (point) =>
      !point.date_from ||
      point.timestamp == null ||
      new Date(point.timestamp * 1000).toISOString().slice(0, 10) ===
        point.date_from,
    "Timestamp must match UTC bucket date",
  )
  .refine(
    (point) =>
      !point.date_from || !point.date_to || point.date_from <= point.date_to,
    "Invalid bucket window",
  );

const trendsGraphItemSchema = z
  .object({
    type: z.literal("google_trends_graph"),
    title: z.string().nullable().optional(),
    keywords: z.array(z.string()).nullable().optional(),
    averages: z.array(trendsInterestSchema).nullable().optional(),
    data: z.array(trendsGraphPointSchema),
  })
  .passthrough();

export type TrendsGraphItem = z.infer<typeof trendsGraphItemSchema>;

const clickstreamVolumeItemSchema = z
  .object({
    keyword: z.string().trim().min(1),
    search_volume: z.number().int().nonnegative().nullable().optional(),
    monthly_searches: z
      .array(
        z
          .object({
            year: z.number().int().min(1900).max(9999),
            month: z.number().int().min(1).max(12),
            search_volume: z.number().int().nonnegative().nullable().optional(),
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
    keyword: z.string().trim().min(1),
    search_volume: z.number().int().nonnegative().nullable().optional(),
    country_distribution: z
      .array(
        z
          .object({
            country_iso_code: z.string().regex(/^[A-Z]{2}$/),
            search_volume: z.number().int().nonnegative().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
  })
  .passthrough();

type GlobalVolumeItem = z.infer<typeof globalVolumeItemSchema>;

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
  const data = parseTrendsItems(task, trendsGraphItemSchema, input);
  assertTrendsGraphColumns(task, data, input.keywords);
  return {
    data,
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
    data: parseTrendsItems(task, clickstreamVolumeItemSchema, {
      ...input,
      useClickstream: true,
    }),
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
  const data = parseTrendsItems(task, globalVolumeItemSchema, input);
  assertGlobalVolumeKeywords(task, data, input.keywords);
  return {
    data,
    billing: buildTaskBilling(task),
  };
}
