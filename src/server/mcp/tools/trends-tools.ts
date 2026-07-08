import { z } from "zod";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  TrendsService,
  type TrendsPoint,
} from "@/server/features/trends/services/TrendsService";
import { MAX_TRENDS_KEYWORDS } from "@/types/schemas/trends";
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
import {
  DEFAULT_LANGUAGE_CODE,
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ------------------------------------------------------------------ */
/*  get_keyword_trends                                                  */
/* ------------------------------------------------------------------ */

const getKeywordTrendsInputSchema = {
  projectId: projectIdSchema,
  keywords: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(MAX_TRENDS_KEYWORDS)
    .describe(`Keywords to compare (1-${MAX_TRENDS_KEYWORDS}).`),
  locationCode: locationCodeSchema
    .optional()
    .describe("DataForSEO location code. Omit for worldwide interest."),
  languageCode: languageCodeSchema.optional(),
  dateFrom: dateSchema
    .optional()
    .describe("Start date (yyyy-mm-dd). Defaults to the past 12 months."),
  dateTo: dateSchema.optional().describe("End date (yyyy-mm-dd)."),
} as const;

type GetKeywordTrendsArgs = z.infer<
  z.ZodObject<typeof getKeywordTrendsInputSchema>
>;

function buildTrendColumns(keywords: string[]): McpTableColumn<TrendsPoint>[] {
  return [
    { header: "date", value: (row) => row.date },
    ...keywords.map((keyword, index) => ({
      header: keyword,
      value: (row: TrendsPoint) => row.values[index],
    })),
  ];
}

export const getKeywordTrendsTool = {
  name: "get_keyword_trends",
  config: {
    title: "Get keyword trends",
    description:
      "Returns Google Trends interest-over-time (0-100 scale) for up to 5 keywords, so you can compare seasonality and momentum. Charges credits.",
    inputSchema: getKeywordTrendsInputSchema,
    outputSchema: {
      keywords: z.array(z.string()),
      averages: z.array(z.number().nullable()),
      points: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetKeywordTrendsArgs, context) => {
    const result = await TrendsService.getTrends(
      {
        projectId: args.projectId,
        keywords: args.keywords,
        locationCode: args.locationCode,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
      },
      context.billing,
    );

    const text =
      result.points.length === 0
        ? `No trend data for ${args.keywords.join(", ")}.`
        : `Google Trends interest for ${result.keywords.join(", ")} (averages: ${result.averages.map((value) => value ?? "—").join(", ")}):\n${formatMcpTable(result.points, buildTrendColumns(result.keywords))}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/trends`,
      ),
      structuredContent: {
        keywords: result.keywords,
        averages: result.averages,
        points: result.points,
      },
    });
  }),
};

/* ------------------------------------------------------------------ */
/*  get_clickstream_search_volume                                       */
/* ------------------------------------------------------------------ */

const getClickstreamVolumeInputSchema = {
  projectId: projectIdSchema,
  keywords: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(1000)
    .describe("Keywords to get clickstream-refined volume for (1-1000)."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type GetClickstreamVolumeArgs = z.infer<
  z.ZodObject<typeof getClickstreamVolumeInputSchema>
>;

const CLICKSTREAM_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "keyword", value: (row) => readPath(row, "keyword") },
  { header: "search_volume", value: (row) => readPath(row, "search_volume") },
] as const;

export const getClickstreamVolumeTool = {
  name: "get_clickstream_search_volume",
  config: {
    title: "Get clickstream search volume",
    description:
      "Returns clickstream-refined monthly search volume for up to 1000 keywords — often more accurate than Google Ads volume, which groups close variants. Charges credits.",
    inputSchema: getClickstreamVolumeInputSchema,
    outputSchema: {
      volumes: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetClickstreamVolumeArgs, context) => {
      const client = createDataforseoClient(context.billing);
      const items = await client.keywords.clickstreamVolume({
        keywords: args.keywords,
        locationCode: args.locationCode ?? 2840,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
        creditFeature: "keyword_research",
      });

      const text =
        items.length === 0
          ? "No clickstream volume data returned."
          : `Clickstream search volume for ${items.length} keywords:\n${formatMcpTable(items, CLICKSTREAM_COLUMNS)}`;
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/keywords`,
        ),
        structuredContent: { volumes: items },
      });
    },
  ),
};

/* ------------------------------------------------------------------ */
/*  get_global_search_volume                                            */
/* ------------------------------------------------------------------ */

const getGlobalVolumeInputSchema = {
  projectId: projectIdSchema,
  keywords: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(1000)
    .describe("Keywords to get worldwide volume distribution for (1-1000)."),
} as const;

type GetGlobalVolumeArgs = z.infer<
  z.ZodObject<typeof getGlobalVolumeInputSchema>
>;

const GLOBAL_VOLUME_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "keyword", value: (row) => readPath(row, "keyword") },
  {
    header: "global_search_volume",
    value: (row) => readPath(row, "search_volume"),
  },
  {
    header: "top_countries",
    value: (row) => {
      const distribution = readPath(row, "country_distribution");
      if (!Array.isArray(distribution)) return null;
      return distribution
        .slice(0, 5)
        .map((entry) => {
          const code = readPath(entry, "country_iso_code");
          const volume = readPath(entry, "search_volume");
          return `${typeof code === "string" ? code : "?"}:${typeof volume === "number" ? volume : "?"}`;
        })
        .join(" ");
    },
  },
] as const;

export const getGlobalVolumeTool = {
  name: "get_global_search_volume",
  config: {
    title: "Get global search volume",
    description:
      "Returns worldwide search volume with a per-country breakdown for up to 1000 keywords. Use to prioritize international SEO markets. Charges credits.",
    inputSchema: getGlobalVolumeInputSchema,
    outputSchema: {
      volumes: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetGlobalVolumeArgs, context) => {
    const client = createDataforseoClient(context.billing);
    const items = await client.keywords.globalVolume({
      keywords: args.keywords,
      creditFeature: "keyword_research",
    });

    const text =
      items.length === 0
        ? "No global volume data returned."
        : `Global search volume for ${items.length} keywords:\n${formatMcpTable(items, GLOBAL_VOLUME_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: { volumes: items },
    });
  }),
};

/* ------------------------------------------------------------------ */
/*  get_ai_search_volume                                                */
/* ------------------------------------------------------------------ */

const getAiSearchVolumeInputSchema = {
  projectId: projectIdSchema,
  keywords: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(1000)
    .describe("Keywords to get AI prompt volume for (1-1000)."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type GetAiSearchVolumeArgs = z.infer<
  z.ZodObject<typeof getAiSearchVolumeInputSchema>
>;

const AI_VOLUME_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "keyword", value: (row) => readPath(row, "keyword") },
  {
    header: "ai_search_volume",
    value: (row) => readPath(row, "ai_search_volume"),
  },
] as const;

export const getAiSearchVolumeTool = {
  name: "get_ai_search_volume",
  config: {
    title: "Get AI search volume",
    description:
      "Returns the estimated monthly volume of keywords appearing in AI assistant prompts (ChatGPT, Gemini, etc.) for up to 1000 keywords. Use alongside classic search volume to prioritize AI-era topics. Charges credits.",
    inputSchema: getAiSearchVolumeInputSchema,
    outputSchema: {
      volumes: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetAiSearchVolumeArgs, context) => {
    const client = createDataforseoClient(context.billing);
    const items = await client.aiSearch.keywordVolume({
      keywords: args.keywords,
      locationCode: args.locationCode ?? 2840,
      languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
      creditFeature: "keyword_research",
    });

    const text =
      items.length === 0
        ? "No AI search volume data returned."
        : `AI prompt volume for ${items.length} keywords:\n${formatMcpTable(items, AI_VOLUME_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: { volumes: items },
    });
  }),
};
