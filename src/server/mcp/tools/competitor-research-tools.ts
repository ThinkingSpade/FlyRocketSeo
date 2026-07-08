/* eslint-disable max-lines */
import { z } from "zod";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  CompetitorsService,
  type CompetitorRow,
  type KeywordGapRow,
} from "@/server/features/competitors/services/CompetitorsService";
import { keywordGapModes } from "@/types/schemas/competitors";
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
  DEFAULT_LOCATION_CODE,
  assertLabsLocationCode,
  assertLanguageForLocation,
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

// Mirrors the domain target rule in dataforseo-research-tools: bare domain or
// subdomain, no protocol, no www.
const domainTargetSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      /^(?!https?:\/\/)(?!www\.)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(
        value,
      ),
    "Use a domain or subdomain without protocol and without www.",
  );

const keywordsListSchema = z
  .array(z.string().min(1).max(200))
  .min(1)
  .max(1000)
  .describe("Keywords to evaluate (1-1000).");

function assertLabsMarket(locationCode?: number, languageCode?: string) {
  assertLabsLocationCode(locationCode);
  assertLanguageForLocation(locationCode, languageCode);
}

/* ------------------------------------------------------------------ */
/*  find_competitors                                                    */
/* ------------------------------------------------------------------ */

const findCompetitorsInputSchema = {
  projectId: projectIdSchema,
  target: domainTargetSchema.describe(
    "Domain (no protocol/www) to find organic competitors for.",
  ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  excludeTopDomains: z
    .boolean()
    .optional()
    .describe(
      "Exclude mega-sites like wikipedia.org that rank for everything. Defaults to true.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum competitors to return (1-100). Defaults to 25."),
} as const;

type FindCompetitorsArgs = z.infer<
  z.ZodObject<typeof findCompetitorsInputSchema>
>;

const COMPETITOR_COLUMNS: McpTableColumn<CompetitorRow>[] = [
  { header: "domain", value: (row) => row.domain },
  { header: "shared_keywords", value: (row) => row.intersections },
  { header: "avg_position", value: (row) => row.avgPosition },
  { header: "organic_keywords", value: (row) => row.organicKeywords },
  { header: "organic_traffic", value: (row) => row.organicTraffic },
];

export const findCompetitorsTool = {
  name: "find_competitors",
  config: {
    title: "Find competitors",
    description:
      "Discovers organic search competitors for a domain: sites ranking for the same keywords, with shared keyword counts and domain metrics. Use get_keyword_gap to compare against a specific competitor. Charges credits.",
    inputSchema: findCompetitorsInputSchema,
    outputSchema: {
      competitors: z.array(looseObjectOutputSchema),
      totalCount: z.number().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: FindCompetitorsArgs, context) => {
    assertLabsMarket(args.locationCode, args.languageCode);
    const page = await CompetitorsService.getCompetitors(
      {
        projectId: args.projectId,
        target: args.target,
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
        excludeTopDomains: args.excludeTopDomains ?? true,
        page: 1,
        pageSize: args.limit ?? 25,
      },
      context.billing,
    );

    const text =
      page.rows.length === 0
        ? `No organic competitors found for ${args.target}.`
        : `Found ${page.rows.length} competitors for ${args.target}${page.totalCount != null ? ` (of ${page.totalCount} total)` : ""}:\n${formatMcpTable(page.rows, COMPETITOR_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/competitors`,
      ),
      structuredContent: {
        competitors: page.rows,
        totalCount: page.totalCount,
      },
    });
  }),
};

/* ------------------------------------------------------------------ */
/*  get_keyword_gap                                                     */
/* ------------------------------------------------------------------ */

const getKeywordGapInputSchema = {
  projectId: projectIdSchema,
  target: domainTargetSchema.describe("Your domain (no protocol/www)."),
  competitor: domainTargetSchema.describe(
    "Competitor domain to compare against (no protocol/www).",
  ),
  mode: z
    .enum(keywordGapModes)
    .optional()
    .describe(
      "missing = keywords the competitor ranks for that you don't (default); shared = keywords you both rank for; advantage = keywords you rank for that the competitor doesn't.",
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  minSearchVolume: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Only return keywords with at least this monthly search volume."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum keywords to return (1-200). Defaults to 50."),
} as const;

type GetKeywordGapArgs = z.infer<z.ZodObject<typeof getKeywordGapInputSchema>>;

const KEYWORD_GAP_COLUMNS: McpTableColumn<KeywordGapRow>[] = [
  { header: "keyword", value: (row) => row.keyword },
  { header: "volume", value: (row) => row.searchVolume },
  { header: "kd", value: (row) => row.keywordDifficulty },
  { header: "cpc", value: (row) => row.cpc },
  { header: "your_rank", value: (row) => row.targetRank },
  { header: "competitor_rank", value: (row) => row.competitorRank },
];

export const getKeywordGapTool = {
  name: "get_keyword_gap",
  config: {
    title: "Get keyword gap",
    description:
      "Compares two domains' organic keywords: keywords the competitor ranks for that you don't (missing), keywords you share, or keywords where you have the advantage. The classic keyword gap analysis. Charges credits.",
    inputSchema: getKeywordGapInputSchema,
    outputSchema: {
      keywords: z.array(looseObjectOutputSchema),
      totalCount: z.number().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetKeywordGapArgs, context) => {
    assertLabsMarket(args.locationCode, args.languageCode);
    const mode = args.mode ?? "missing";
    const page = await CompetitorsService.getKeywordGap(
      {
        projectId: args.projectId,
        target: args.target,
        competitor: args.competitor,
        mode,
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
        minSearchVolume: args.minSearchVolume,
        page: 1,
        pageSize: args.limit ?? 50,
      },
      context.billing,
    );

    const text =
      page.rows.length === 0
        ? `No ${mode} keywords found for ${args.target} vs ${args.competitor}.`
        : `Found ${page.rows.length} ${mode} keywords for ${args.target} vs ${args.competitor}${page.totalCount != null ? ` (of ${page.totalCount} total)` : ""}:\n${formatMcpTable(page.rows, KEYWORD_GAP_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/competitors`,
      ),
      structuredContent: {
        keywords: page.rows,
        totalCount: page.totalCount,
      },
    });
  }),
};

/* ------------------------------------------------------------------ */
/*  get_keywords_for_site                                               */
/* ------------------------------------------------------------------ */

const getKeywordsForSiteInputSchema = {
  projectId: projectIdSchema,
  target: domainTargetSchema.describe(
    "Domain (no protocol/www) to generate relevant keywords for.",
  ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  includeSubdomains: z
    .boolean()
    .optional()
    .describe("Include subdomains of the target. Defaults to true."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(300)
    .optional()
    .describe("Maximum keywords to return (1-300). Defaults to 100."),
  offset: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .optional()
    .describe("Rows to skip for pagination."),
} as const;

type GetKeywordsForSiteArgs = z.infer<
  z.ZodObject<typeof getKeywordsForSiteInputSchema>
>;

const KEYWORDS_FOR_SITE_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "keyword", value: (row) => readPath(row, "keyword") },
  {
    header: "volume",
    value: (row) => readPath(row, "keyword_info", "search_volume"),
  },
  { header: "cpc", value: (row) => readPath(row, "keyword_info", "cpc") },
  {
    header: "kd",
    value: (row) => readPath(row, "keyword_properties", "keyword_difficulty"),
  },
  {
    header: "intent",
    value: (row) => readPath(row, "search_intent_info", "main_intent"),
  },
] as const;

export const getKeywordsForSiteTool = {
  name: "get_keywords_for_site",
  config: {
    title: "Get keywords for site",
    description:
      "Returns keywords relevant to an entire website based on its content, with volume, CPC, difficulty, and intent. Different from get_ranked_keywords: these are keywords the site COULD target, not ones it already ranks for. Charges credits.",
    inputSchema: getKeywordsForSiteInputSchema,
    outputSchema: {
      keywords: z.array(looseObjectOutputSchema),
      totalCount: z.number().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetKeywordsForSiteArgs, context) => {
    assertLabsMarket(args.locationCode, args.languageCode);
    const client = createDataforseoClient(context.billing);
    const page = await client.keywords.forSite({
      target: args.target,
      locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
      languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
      limit: args.limit ?? 100,
      offset: args.offset,
      includeSubdomains: args.includeSubdomains ?? true,
      creditFeature: "keyword_research",
    });

    const text =
      page.items.length === 0
        ? `No keywords found for ${args.target}.`
        : `Found ${page.items.length} keywords for ${args.target}${page.totalCount != null ? ` (of ${page.totalCount} total)` : ""}:\n${formatMcpTable(page.items, KEYWORDS_FOR_SITE_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: {
        keywords: page.items,
        totalCount: page.totalCount,
      },
    });
  }),
};

/* ------------------------------------------------------------------ */
/*  get_keyword_difficulty                                              */
/* ------------------------------------------------------------------ */

const getKeywordDifficultyInputSchema = {
  projectId: projectIdSchema,
  keywords: keywordsListSchema,
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type GetKeywordDifficultyArgs = z.infer<
  z.ZodObject<typeof getKeywordDifficultyInputSchema>
>;

const DIFFICULTY_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "keyword", value: (row) => readPath(row, "keyword") },
  { header: "difficulty", value: (row) => readPath(row, "keyword_difficulty") },
] as const;

export const getKeywordDifficultyTool = {
  name: "get_keyword_difficulty",
  config: {
    title: "Get keyword difficulty",
    description:
      "Returns keyword difficulty scores (0-100) for up to 1000 keywords in one call. Cheaper than fetching full keyword metrics when you only need difficulty. Charges credits.",
    inputSchema: getKeywordDifficultyInputSchema,
    outputSchema: {
      difficulties: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetKeywordDifficultyArgs, context) => {
      assertLabsMarket(args.locationCode, args.languageCode);
      const client = createDataforseoClient(context.billing);
      const items = await client.keywords.bulkDifficulty({
        keywords: args.keywords,
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
        creditFeature: "keyword_research",
      });

      const text =
        items.length === 0
          ? "No difficulty data returned."
          : `Keyword difficulty for ${items.length} keywords:\n${formatMcpTable(items, DIFFICULTY_COLUMNS)}`;
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/keywords`,
        ),
        structuredContent: { difficulties: items },
      });
    },
  ),
};

/* ------------------------------------------------------------------ */
/*  get_search_intent                                                   */
/* ------------------------------------------------------------------ */

const getSearchIntentInputSchema = {
  projectId: projectIdSchema,
  keywords: keywordsListSchema,
  languageCode: languageCodeSchema.optional(),
} as const;

type GetSearchIntentArgs = z.infer<
  z.ZodObject<typeof getSearchIntentInputSchema>
>;

const INTENT_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "keyword", value: (row) => readPath(row, "keyword") },
  {
    header: "intent",
    value: (row) => readPath(row, "keyword_intent", "label"),
  },
  {
    header: "probability",
    value: (row) => readPath(row, "keyword_intent", "probability"),
  },
] as const;

export const getSearchIntentTool = {
  name: "get_search_intent",
  config: {
    title: "Get search intent",
    description:
      "Classifies search intent (informational, navigational, commercial, transactional) with probabilities for up to 1000 keywords in one call. Charges credits.",
    inputSchema: getSearchIntentInputSchema,
    outputSchema: {
      intents: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetSearchIntentArgs, context) => {
    const client = createDataforseoClient(context.billing);
    const items = await client.keywords.searchIntent({
      keywords: args.keywords,
      languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
      creditFeature: "keyword_research",
    });

    const text =
      items.length === 0
        ? "No search intent data returned."
        : `Search intent for ${items.length} keywords:\n${formatMcpTable(items, INTENT_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: { intents: items },
    });
  }),
};

/* ------------------------------------------------------------------ */
/*  estimate_domain_traffic                                             */
/* ------------------------------------------------------------------ */

const estimateDomainTrafficInputSchema = {
  projectId: projectIdSchema,
  targets: z
    .array(domainTargetSchema)
    .min(1)
    .max(1000)
    .describe("Domains (no protocol/www) to estimate organic traffic for."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type EstimateDomainTrafficArgs = z.infer<
  z.ZodObject<typeof estimateDomainTrafficInputSchema>
>;

const TRAFFIC_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "domain", value: (row) => readPath(row, "target") },
  {
    header: "organic_traffic",
    value: (row) => readPath(row, "metrics", "organic", "etv"),
  },
  {
    header: "organic_keywords",
    value: (row) => readPath(row, "metrics", "organic", "count"),
  },
  {
    header: "paid_traffic",
    value: (row) => readPath(row, "metrics", "paid", "etv"),
  },
] as const;

export const estimateDomainTrafficTool = {
  name: "estimate_domain_traffic",
  config: {
    title: "Estimate domain traffic",
    description:
      "Estimates monthly organic and paid search traffic for up to 1000 domains in one call. Use for quickly sizing competitors or prospect lists. Charges credits.",
    inputSchema: estimateDomainTrafficInputSchema,
    outputSchema: {
      estimates: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: EstimateDomainTrafficArgs, context) => {
      assertLabsMarket(args.locationCode, args.languageCode);
      const client = createDataforseoClient(context.billing);
      const items = await client.competitors.trafficEstimation({
        targets: args.targets,
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
      });

      const text =
        items.length === 0
          ? "No traffic estimates returned."
          : `Traffic estimates for ${items.length} domains:\n${formatMcpTable(items, TRAFFIC_COLUMNS)}`;
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/competitors`,
        ),
        structuredContent: { estimates: items },
      });
    },
  ),
};

/* ------------------------------------------------------------------ */
/*  get_domain_rank_history                                             */
/* ------------------------------------------------------------------ */

const getDomainRankHistoryInputSchema = {
  projectId: projectIdSchema,
  target: domainTargetSchema.describe(
    "Domain (no protocol/www) to fetch historical rank data for.",
  ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Start date (yyyy-mm-dd). Data reaches back to 2019."),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("End date (yyyy-mm-dd)."),
} as const;

type GetDomainRankHistoryArgs = z.infer<
  z.ZodObject<typeof getDomainRankHistoryInputSchema>
>;

const HISTORY_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "year", value: (row) => readPath(row, "year") },
  { header: "month", value: (row) => readPath(row, "month") },
  {
    header: "organic_keywords",
    value: (row) => readPath(row, "metrics", "organic", "count"),
  },
  {
    header: "organic_traffic",
    value: (row) => readPath(row, "metrics", "organic", "etv"),
  },
  {
    header: "top_3",
    value: (row) => readPath(row, "metrics", "organic", "pos_1"),
  },
] as const;

export const getDomainRankHistoryTool = {
  name: "get_domain_rank_history",
  config: {
    title: "Get domain rank history",
    description:
      "Returns month-by-month historical organic visibility for a domain: keyword counts, traffic estimates, and position distribution over time. Use to chart SEO trends and spot algorithm-update impact. Charges credits.",
    inputSchema: getDomainRankHistoryInputSchema,
    outputSchema: {
      history: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetDomainRankHistoryArgs, context) => {
      assertLabsMarket(args.locationCode, args.languageCode);
      const client = createDataforseoClient(context.billing);
      const items = await client.domain.historicalRankOverview({
        target: args.target,
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
      });

      const text =
        items.length === 0
          ? `No historical rank data for ${args.target}.`
          : `Historical rank overview for ${args.target} (${items.length} months):\n${formatMcpTable(items, HISTORY_COLUMNS)}`;
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/domain`,
        ),
        structuredContent: { history: items },
      });
    },
  ),
};

/* ------------------------------------------------------------------ */
/*  get_subdomains                                                      */
/* ------------------------------------------------------------------ */

const getSubdomainsInputSchema = {
  projectId: projectIdSchema,
  target: domainTargetSchema.describe(
    "Root domain (no protocol/www) to list ranking subdomains for.",
  ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum subdomains to return (1-100). Defaults to 25."),
} as const;

type GetSubdomainsArgs = z.infer<z.ZodObject<typeof getSubdomainsInputSchema>>;

const SUBDOMAIN_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "subdomain", value: (row) => readPath(row, "subdomain") },
  {
    header: "organic_keywords",
    value: (row) => readPath(row, "metrics", "organic", "count"),
  },
  {
    header: "organic_traffic",
    value: (row) => readPath(row, "metrics", "organic", "etv"),
  },
] as const;

export const getSubdomainsTool = {
  name: "get_subdomains",
  config: {
    title: "Get subdomains",
    description:
      "Lists a domain's subdomains that rank in organic search, with keyword counts and traffic estimates per subdomain. Charges credits.",
    inputSchema: getSubdomainsInputSchema,
    outputSchema: {
      subdomains: z.array(looseObjectOutputSchema),
      totalCount: z.number().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetSubdomainsArgs, context) => {
    assertLabsMarket(args.locationCode, args.languageCode);
    const client = createDataforseoClient(context.billing);
    const page = await client.competitors.subdomains({
      target: args.target,
      locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
      languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
      limit: args.limit ?? 25,
      orderBy: ["metrics.organic.etv,desc"],
    });

    const text =
      page.items.length === 0
        ? `No ranking subdomains found for ${args.target}.`
        : `Found ${page.items.length} ranking subdomains for ${args.target}${page.totalCount != null ? ` (of ${page.totalCount} total)` : ""}:\n${formatMcpTable(page.items, SUBDOMAIN_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/domain`,
      ),
      structuredContent: {
        subdomains: page.items,
        totalCount: page.totalCount,
      },
    });
  }),
};
