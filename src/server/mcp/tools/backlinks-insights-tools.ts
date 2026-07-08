import { z } from "zod";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeBacklinksTarget } from "@/server/lib/dataforseo/backlinks";
import {
  CompetitorsService,
  type LinkGapRow,
} from "@/server/features/competitors/services/CompetitorsService";
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

const backlinksTargetSchema = z
  .string()
  .min(1)
  .max(2048)
  .describe("Domain (no protocol) or absolute page URL to analyze.");

const domainOnlySchema = z
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

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ------------------------------------------------------------------ */
/*  get_backlink_anchors                                                */
/* ------------------------------------------------------------------ */

const getBacklinkAnchorsInputSchema = {
  projectId: projectIdSchema,
  target: backlinksTargetSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum anchors to return (1-200). Defaults to 50."),
  offset: z
    .number()
    .int()
    .min(0)
    .max(2000)
    .optional()
    .describe("Rows to skip for pagination."),
} as const;

type GetBacklinkAnchorsArgs = z.infer<
  z.ZodObject<typeof getBacklinkAnchorsInputSchema>
>;

const ANCHOR_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "anchor", value: (row) => readPath(row, "anchor") },
  { header: "backlinks", value: (row) => readPath(row, "backlinks") },
  {
    header: "referring_domains",
    value: (row) => readPath(row, "referring_domains"),
  },
  { header: "rank", value: (row) => readPath(row, "rank") },
  {
    header: "spam_score",
    value: (row) => readPath(row, "backlinks_spam_score"),
  },
] as const;

export const getBacklinkAnchorsTool = {
  name: "get_backlink_anchors",
  config: {
    title: "Get backlink anchors",
    description:
      "Returns the anchor-text distribution of a domain or page's backlink profile: each anchor with its backlink count, referring domains, and rank. Use to audit anchor diversity and detect over-optimization. Charges credits.",
    inputSchema: getBacklinkAnchorsInputSchema,
    outputSchema: {
      anchors: z.array(looseObjectOutputSchema),
      totalCount: z.number().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetBacklinkAnchorsArgs, context) => {
    const client = createDataforseoClient(context.billing);
    const page = await client.backlinks.anchors({
      target: normalizeBacklinksTarget(args.target).apiTarget,
      limit: args.limit ?? 50,
      offset: args.offset,
    });

    const text =
      page.items.length === 0
        ? `No anchor data for ${args.target}.`
        : `Found ${page.items.length} anchors for ${args.target}${page.totalCount != null ? ` (of ${page.totalCount} total)` : ""}:\n${formatMcpTable(page.items, ANCHOR_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/backlinks`,
      ),
      structuredContent: {
        anchors: page.items,
        totalCount: page.totalCount,
      },
    });
  }),
};

/* ------------------------------------------------------------------ */
/*  find_link_competitors                                               */
/* ------------------------------------------------------------------ */

const findLinkCompetitorsInputSchema = {
  projectId: projectIdSchema,
  target: domainOnlySchema.describe(
    "Domain (no protocol/www) to find backlink competitors for.",
  ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum competitors to return (1-100). Defaults to 25."),
} as const;

type FindLinkCompetitorsArgs = z.infer<
  z.ZodObject<typeof findLinkCompetitorsInputSchema>
>;

const LINK_COMPETITOR_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "domain", value: (row) => readPath(row, "target") },
  {
    header: "shared_referring_domains",
    value: (row) => readPath(row, "intersections"),
  },
  { header: "rank", value: (row) => readPath(row, "rank") },
] as const;

export const findLinkCompetitorsTool = {
  name: "find_link_competitors",
  config: {
    title: "Find link competitors",
    description:
      "Finds domains with backlink profiles similar to the target: sites that share the most referring domains. Use get_link_gap to see which referring domains a competitor has that you don't. Charges credits.",
    inputSchema: findLinkCompetitorsInputSchema,
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
  handler: withMcpProjectAuth(
    async (args: FindLinkCompetitorsArgs, context) => {
      const client = createDataforseoClient(context.billing);
      const page = await client.backlinks.competitors({
        target: args.target,
        limit: args.limit ?? 25,
      });

      const text =
        page.items.length === 0
          ? `No link competitors found for ${args.target}.`
          : `Found ${page.items.length} link competitors for ${args.target}${page.totalCount != null ? ` (of ${page.totalCount} total)` : ""}:\n${formatMcpTable(page.items, LINK_COMPETITOR_COLUMNS)}`;
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/competitors`,
        ),
        structuredContent: {
          competitors: page.items,
          totalCount: page.totalCount,
        },
      });
    },
  ),
};

/* ------------------------------------------------------------------ */
/*  get_link_gap                                                        */
/* ------------------------------------------------------------------ */

const getLinkGapInputSchema = {
  projectId: projectIdSchema,
  target: domainOnlySchema.describe("Your domain (no protocol/www)."),
  competitor: domainOnlySchema.describe(
    "Competitor domain whose referring domains to prospect (no protocol/www).",
  ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum referring domains to return (1-100). Defaults to 50."),
} as const;

type GetLinkGapArgs = z.infer<z.ZodObject<typeof getLinkGapInputSchema>>;

const LINK_GAP_COLUMNS: McpTableColumn<LinkGapRow>[] = [
  { header: "referring_domain", value: (row) => row.referringDomain },
  { header: "rank", value: (row) => row.rank },
  {
    header: "backlinks_to_competitor",
    value: (row) => row.backlinksToCompetitor,
  },
  { header: "spam_score", value: (row) => row.spamScore },
  { header: "first_seen", value: (row) => row.firstSeen },
];

export const getLinkGapTool = {
  name: "get_link_gap",
  config: {
    title: "Get link gap",
    description:
      "Lists referring domains that link to a competitor but NOT to you — ready-made link prospecting targets, sorted by domain rank. Charges credits.",
    inputSchema: getLinkGapInputSchema,
    outputSchema: {
      referringDomains: z.array(looseObjectOutputSchema),
      totalCount: z.number().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetLinkGapArgs, context) => {
    const page = await CompetitorsService.getLinkGap(
      {
        projectId: args.projectId,
        target: args.target,
        competitor: args.competitor,
        page: 1,
        pageSize: args.limit ?? 50,
      },
      context.billing,
    );

    const text =
      page.rows.length === 0
        ? `No link gap found: every domain linking to ${args.competitor} also links to ${args.target}.`
        : `Found ${page.rows.length} domains linking to ${args.competitor} but not ${args.target}${page.totalCount != null ? ` (of ${page.totalCount} total)` : ""}:\n${formatMcpTable(page.rows, LINK_GAP_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/competitors`,
      ),
      structuredContent: {
        referringDomains: page.rows,
        totalCount: page.totalCount,
      },
    });
  }),
};

/* ------------------------------------------------------------------ */
/*  get_spam_scores                                                     */
/* ------------------------------------------------------------------ */

const getSpamScoresInputSchema = {
  projectId: projectIdSchema,
  targets: z
    .array(z.string().min(1).max(2048))
    .min(1)
    .max(1000)
    .describe("Domains or page URLs to score (1-1000)."),
} as const;

type GetSpamScoresArgs = z.infer<z.ZodObject<typeof getSpamScoresInputSchema>>;

const SPAM_SCORE_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "target", value: (row) => readPath(row, "target") },
  { header: "spam_score", value: (row) => readPath(row, "spam_score") },
] as const;

export const getSpamScoresTool = {
  name: "get_spam_scores",
  config: {
    title: "Get spam scores",
    description:
      "Returns spam scores (0-100, higher is spammier) for up to 1000 domains or URLs in one call. Use to vet link prospects or audit a backlink profile for toxic links. Charges credits.",
    inputSchema: getSpamScoresInputSchema,
    outputSchema: {
      scores: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetSpamScoresArgs, context) => {
    const client = createDataforseoClient(context.billing);
    const items = await client.backlinks.bulkSpamScores({
      targets: args.targets,
    });

    const text =
      items.length === 0
        ? "No spam score data returned."
        : `Spam scores for ${items.length} targets:\n${formatMcpTable(items, SPAM_SCORE_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/backlinks`,
      ),
      structuredContent: { scores: items },
    });
  }),
};

/* ------------------------------------------------------------------ */
/*  get_new_lost_backlinks                                              */
/* ------------------------------------------------------------------ */

const getNewLostBacklinksInputSchema = {
  projectId: projectIdSchema,
  target: backlinksTargetSchema,
  dateFrom: dateSchema
    .optional()
    .describe(
      "Start date (yyyy-mm-dd). Defaults to 12 months ago. Data reaches back to 2019.",
    ),
  dateTo: dateSchema
    .optional()
    .describe("End date (yyyy-mm-dd). Defaults to today."),
  groupRange: z
    .enum(["day", "week", "month"])
    .optional()
    .describe("Aggregation bucket. Defaults to month."),
} as const;

type GetNewLostBacklinksArgs = z.infer<
  z.ZodObject<typeof getNewLostBacklinksInputSchema>
>;

const NEW_LOST_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "date", value: (row) => readPath(row, "date") },
  { header: "new_backlinks", value: (row) => readPath(row, "new_backlinks") },
  { header: "lost_backlinks", value: (row) => readPath(row, "lost_backlinks") },
  {
    header: "new_referring_domains",
    value: (row) => readPath(row, "new_referring_domains"),
  },
  {
    header: "lost_referring_domains",
    value: (row) => readPath(row, "lost_referring_domains"),
  },
] as const;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const getNewLostBacklinksTool = {
  name: "get_new_lost_backlinks",
  config: {
    title: "Get new and lost backlinks",
    description:
      "Returns a timeline of new vs lost backlinks and referring domains for a target, bucketed by day, week, or month. Use to monitor link velocity and detect link losses. Charges credits.",
    inputSchema: getNewLostBacklinksInputSchema,
    outputSchema: {
      timeline: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetNewLostBacklinksArgs, context) => {
      const now = new Date();
      const yearAgo = new Date(now);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);

      const client = createDataforseoClient(context.billing);
      const items = await client.backlinks.newLostTimeseries({
        target: normalizeBacklinksTarget(args.target).apiTarget,
        dateFrom: args.dateFrom ?? toIsoDate(yearAgo),
        dateTo: args.dateTo ?? toIsoDate(now),
        groupRange: args.groupRange ?? "month",
      });

      const text =
        items.length === 0
          ? `No new/lost backlink data for ${args.target}.`
          : `New vs lost backlinks for ${args.target} (${items.length} periods):\n${formatMcpTable(items, NEW_LOST_COLUMNS)}`;
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/backlinks`,
        ),
        structuredContent: { timeline: items },
      });
    },
  ),
};
