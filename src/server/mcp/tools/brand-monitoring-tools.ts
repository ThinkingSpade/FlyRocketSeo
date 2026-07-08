import { z } from "zod";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  formatMcpTable,
  readPath,
  type McpTableColumn,
} from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";

const brandKeywordSchema = z
  .string()
  .min(1)
  .max(200)
  .describe('Brand or phrase to search for (e.g. "openseo").');

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ------------------------------------------------------------------ */
/*  search_brand_mentions                                               */
/* ------------------------------------------------------------------ */

const searchBrandMentionsInputSchema = {
  projectId: projectIdSchema,
  keyword: brandKeywordSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum mentions to return (1-100). Defaults to 25."),
  offset: z
    .number()
    .int()
    .min(0)
    .max(2000)
    .optional()
    .describe("Rows to skip for pagination."),
} as const;

type SearchBrandMentionsArgs = z.infer<
  z.ZodObject<typeof searchBrandMentionsInputSchema>
>;

const MENTION_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "domain", value: (row) => readPath(row, "domain") },
  { header: "url", value: (row) => readPath(row, "url") },
  { header: "domain_rank", value: (row) => readPath(row, "domain_rank") },
  {
    header: "sentiment",
    value: (row) => {
      const connotation = readPath(row, "content_info", "sentence_connotation");
      return typeof connotation === "string" ? connotation : null;
    },
  },
  {
    header: "snippet",
    value: (row) => readPath(row, "content_info", "snippet"),
  },
] as const;

export const searchBrandMentionsTool = {
  name: "search_brand_mentions",
  config: {
    title: "Search brand mentions",
    description:
      "Searches DataForSEO's web content index for pages mentioning a brand or phrase, with domain rank, sentiment, and a snippet per mention. Complements AI citation tools with classic web mentions. Charges credits.",
    inputSchema: searchBrandMentionsInputSchema,
    outputSchema: {
      mentions: z.array(looseObjectOutputSchema),
      totalCount: z.number().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: SearchBrandMentionsArgs, context) => {
      const client = createDataforseoClient(context.billing);
      const page = await client.brandMonitoring.mentions({
        keyword: args.keyword,
        limit: args.limit ?? 25,
        offset: args.offset,
      });

      const text =
        page.items.length === 0
          ? `No web mentions found for "${args.keyword}".`
          : `Found ${page.items.length} mentions of "${args.keyword}"${page.totalCount != null ? ` (of ${page.totalCount} total)` : ""}:\n${formatMcpTable(page.items, MENTION_COLUMNS)}`;
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/brand-lookup`,
        ),
        structuredContent: {
          mentions: page.items,
          totalCount: page.totalCount,
        },
      });
    },
  ),
};

/* ------------------------------------------------------------------ */
/*  get_brand_mention_summary                                           */
/* ------------------------------------------------------------------ */

const getBrandMentionSummaryInputSchema = {
  projectId: projectIdSchema,
  keyword: brandKeywordSchema,
} as const;

type GetBrandMentionSummaryArgs = z.infer<
  z.ZodObject<typeof getBrandMentionSummaryInputSchema>
>;

export const getBrandMentionSummaryTool = {
  name: "get_brand_mention_summary",
  config: {
    title: "Get brand mention summary",
    description:
      "Returns an aggregated summary of a brand's web mentions: total count, sentiment breakdown, top citing domains, countries, and languages. Charges credits.",
    inputSchema: getBrandMentionSummaryInputSchema,
    outputSchema: {
      summary: looseObjectOutputSchema.nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetBrandMentionSummaryArgs, context) => {
      const client = createDataforseoClient(context.billing);
      const summary = await client.brandMonitoring.summary({
        keyword: args.keyword,
      });

      const sentiment = summary?.sentiment_connotations ?? {};
      const sentimentText = Object.entries(sentiment)
        .map(([label, count]) => `${label}: ${count ?? 0}`)
        .join(", ");
      const topDomains = (summary?.top_domains ?? [])
        .slice(0, 10)
        .map((entry) => `${entry.domain ?? "?"} (${entry.count ?? 0})`)
        .join(", ");
      const text = summary
        ? [
            `Web mention summary for "${args.keyword}":`,
            `- total mentions: ${summary.total_count ?? "—"}`,
            sentimentText ? `- sentiment: ${sentimentText}` : null,
            topDomains ? `- top domains: ${topDomains}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        : `No mention summary available for "${args.keyword}".`;
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/brand-lookup`,
        ),
        structuredContent: { summary: summary ?? null },
      });
    },
  ),
};

/* ------------------------------------------------------------------ */
/*  get_brand_mention_trends                                            */
/* ------------------------------------------------------------------ */

const getBrandMentionTrendsInputSchema = {
  projectId: projectIdSchema,
  keyword: brandKeywordSchema,
  dateFrom: dateSchema
    .optional()
    .describe("Start date (yyyy-mm-dd). Defaults to 12 months ago."),
  dateTo: dateSchema.optional().describe("End date (yyyy-mm-dd)."),
  dateGroup: z
    .enum(["day", "week", "month"])
    .optional()
    .describe("Aggregation bucket. Defaults to month."),
} as const;

type GetBrandMentionTrendsArgs = z.infer<
  z.ZodObject<typeof getBrandMentionTrendsInputSchema>
>;

const MENTION_TREND_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "date", value: (row) => readPath(row, "date") },
  { header: "mentions", value: (row) => readPath(row, "total_count") },
] as const;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const getBrandMentionTrendsTool = {
  name: "get_brand_mention_trends",
  config: {
    title: "Get brand mention trends",
    description:
      "Returns how often a brand or phrase was mentioned across the web over time, bucketed by day, week, or month. Use to spot PR spikes and measure brand momentum. Charges credits.",
    inputSchema: getBrandMentionTrendsInputSchema,
    outputSchema: {
      trends: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetBrandMentionTrendsArgs, context) => {
      const now = new Date();
      const yearAgo = new Date(now);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);

      const client = createDataforseoClient(context.billing);
      const points = await client.brandMonitoring.trends({
        keyword: args.keyword,
        dateFrom: args.dateFrom ?? toIsoDate(yearAgo),
        dateTo: args.dateTo ?? toIsoDate(now),
        dateGroup: args.dateGroup,
      });

      const text =
        points.length === 0
          ? `No mention trend data for "${args.keyword}".`
          : `Mention trend for "${args.keyword}" (${points.length} periods):\n${formatMcpTable(points, MENTION_TREND_COLUMNS)}`;
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/brand-lookup`,
        ),
        structuredContent: { trends: points },
      });
    },
  ),
};
