import { z } from "zod";
import {
  ContentAnalysisPhraseTrendsLiveRequestInfo,
  ContentAnalysisSearchLiveRequestInfo,
  ContentAnalysisSummaryLiveRequestInfo,
  type ContentAnalysisSearchLiveItem,
} from "dataforseo-client";
import { contentAnalysisApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  isRecord,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

// Web-wide brand mention search over DataForSEO's content index: citation
// rows, an aggregated sentiment summary, and mention volume over time.

type BrandMentionItem = ContentAnalysisSearchLiveItem;

type MentionsPage = {
  items: BrandMentionItem[];
  totalCount: number | null;
};

export async function fetchBrandMentions(input: {
  keyword: string;
  limit?: number;
  offset?: number;
  /** "one_per_domain" (default) or "as_is". */
  searchMode?: string;
  filters?: unknown[];
}): Promise<DataforseoApiResponse<MentionsPage>> {
  const response = await contentAnalysisApi().searchLive([
    new ContentAnalysisSearchLiveRequestInfo({
      keyword: input.keyword,
      search_mode: input.searchMode ?? "one_per_domain",
      limit: input.limit ?? 50,
      offset: input.offset,
      filters: input.filters,
      order_by: ["content_info.sentence_score,desc"],
      rank_scale: "one_hundred",
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: {
      items: task.result?.[0]?.items ?? [],
      totalCount: task.result?.[0]?.total_count ?? null,
    },
    billing: buildTaskBilling(task),
  };
}

// The SDK leaves the summary result untyped; validate the fields we surface
// and pass the rest through.
const mentionsSummarySchema = z
  .object({
    total_count: z.number().nullable().optional(),
    rank: z.number().nullable().optional(),
    top_domains: z
      .array(
        z
          .object({
            domain: z.string().nullable().optional(),
            count: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    sentiment_connotations: z
      .record(z.string(), z.number().nullable())
      .nullable()
      .optional(),
    connotation_types: z
      .record(z.string(), z.number().nullable())
      .nullable()
      .optional(),
    countries: z
      .record(z.string(), z.number().nullable())
      .nullable()
      .optional(),
    languages: z
      .record(z.string(), z.number().nullable())
      .nullable()
      .optional(),
  })
  .passthrough();

type BrandMentionsSummary = z.infer<typeof mentionsSummarySchema>;

export async function fetchBrandMentionsSummary(input: {
  keyword: string;
}): Promise<DataforseoApiResponse<BrandMentionsSummary | null>> {
  const response = await contentAnalysisApi().contentAnalysisSummaryLive([
    new ContentAnalysisSummaryLiveRequestInfo({
      keyword: input.keyword,
      rank_scale: "one_hundred",
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const first = task.result?.[0];
  const parsed = mentionsSummarySchema.safeParse(first ?? {});
  return {
    data: isRecord(first) && parsed.success ? parsed.data : null,
    billing: buildTaskBilling(task),
  };
}

const mentionTrendPointSchema = z
  .object({
    date: z.string().nullable().optional(),
    total_count: z.number().nullable().optional(),
    sentiment_connotations: z
      .record(z.string(), z.number().nullable())
      .nullable()
      .optional(),
  })
  .passthrough();

type MentionTrendPoint = z.infer<typeof mentionTrendPointSchema>;

export async function fetchBrandMentionTrends(input: {
  keyword: string;
  dateFrom: string;
  dateTo: string;
  /** Aggregation bucket: "day" | "week" | "month" (DataForSEO date_group). */
  dateGroup?: string;
}): Promise<DataforseoApiResponse<MentionTrendPoint[]>> {
  const response = await contentAnalysisApi().phraseTrendsLive([
    new ContentAnalysisPhraseTrendsLiveRequestInfo({
      keyword: input.keyword,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      date_group: input.dateGroup ?? "month",
      rank_scale: "one_hundred",
    }),
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  // Typed as unknown so the property read below yields unknown, not any.
  const first: unknown = task.result?.[0];
  const items = isRecord(first) ? first.items : [];
  const parsed = z.array(mentionTrendPointSchema).safeParse(items ?? []);
  return {
    data: parsed.success ? parsed.data : [],
    billing: buildTaskBilling(task),
  };
}
