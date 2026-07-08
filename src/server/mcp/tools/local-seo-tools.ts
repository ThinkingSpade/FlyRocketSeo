import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  LocalSeoService,
  type BusinessProfile,
} from "@/server/features/local-seo/services/LocalSeoService";
import {
  DEFAULT_REVIEWS_DEPTH,
  MAX_REVIEWS_DEPTH,
} from "@/types/schemas/local-seo";
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
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

/* ------------------------------------------------------------------ */
/*  get_business_profile                                                */
/* ------------------------------------------------------------------ */

const getBusinessProfileInputSchema = {
  projectId: projectIdSchema,
  keyword: z
    .string()
    .min(1)
    .max(200)
    .describe(
      'Business name to look up, optionally with a city (e.g. "Joe\'s Pizza Brooklyn").',
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type GetBusinessProfileArgs = z.infer<
  z.ZodObject<typeof getBusinessProfileInputSchema>
>;

function formatProfileText(keyword: string, profile: BusinessProfile): string {
  if (!profile.found) {
    return `No Google Business Profile found for "${keyword}".`;
  }
  const lines = [
    `Google Business Profile for ${profile.title ?? keyword}:`,
    `- category: ${profile.category ?? "—"}`,
    `- rating: ${profile.rating ?? "—"} (${profile.reviewsCount ?? "—"} reviews)`,
    `- address: ${profile.address ?? "—"}`,
    `- phone: ${profile.phone ?? "—"}`,
    `- website: ${profile.url ?? "—"}`,
    `- claimed: ${profile.isClaimed == null ? "—" : profile.isClaimed ? "yes" : "no"}`,
  ];
  if (profile.additionalCategories.length > 0) {
    lines.push(
      `- additional categories: ${profile.additionalCategories.join(", ")}`,
    );
  }
  return lines.join("\n");
}

export const getBusinessProfileTool = {
  name: "get_business_profile",
  config: {
    title: "Get business profile",
    description:
      "Returns a business's Google Business Profile: category, rating, review count, address, phone, website, and claimed status. The core local SEO health check. Charges credits.",
    inputSchema: getBusinessProfileInputSchema,
    outputSchema: {
      profile: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetBusinessProfileArgs, context) => {
    const profile = await LocalSeoService.getBusinessProfile(
      {
        projectId: args.projectId,
        keyword: args.keyword,
        locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
        languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
      },
      context.billing,
    );

    return mcpResponse({
      text: formatProfileText(args.keyword, profile),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/local`,
      ),
      structuredContent: { profile },
    });
  }),
};

/* ------------------------------------------------------------------ */
/*  get_business_reviews                                                */
/* ------------------------------------------------------------------ */

const getBusinessReviewsInputSchema = {
  projectId: projectIdSchema,
  keyword: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Business name to fetch reviews for. Required unless taskId is set.",
    ),
  taskId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Task id returned by a previous pending call; collects that task instead of starting a new one.",
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  depth: z
    .number()
    .int()
    .min(10)
    .max(MAX_REVIEWS_DEPTH)
    .optional()
    .describe(
      `Number of newest reviews to fetch (10-${MAX_REVIEWS_DEPTH}). Defaults to ${DEFAULT_REVIEWS_DEPTH}.`,
    ),
} as const;

type GetBusinessReviewsArgs = z.infer<
  z.ZodObject<typeof getBusinessReviewsInputSchema>
>;

const REVIEW_COLUMNS: McpTableColumn<unknown>[] = [
  { header: "rating", value: (row) => readPath(row, "rating") },
  { header: "author", value: (row) => readPath(row, "author") },
  { header: "date", value: (row) => readPath(row, "timestamp") },
  { header: "review", value: (row) => readPath(row, "text") },
  { header: "owner_reply", value: (row) => readPath(row, "ownerAnswer") },
] as const;

const REVIEWS_POLL_ATTEMPTS = 5;
const REVIEWS_POLL_INTERVAL_MS = 5_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getBusinessReviewsTool = {
  name: "get_business_reviews",
  config: {
    title: "Get business reviews",
    description:
      "Fetches a business's newest Google reviews (text, rating, author, owner replies). Reviews are crawled asynchronously: this tool waits up to ~25 seconds, and if the crawl is still running it returns a taskId — call the tool again with that taskId to collect the finished result. Charges credits when starting a crawl; collecting is free.",
    inputSchema: getBusinessReviewsInputSchema,
    outputSchema: {
      status: z.enum(["pending", "completed"]),
      taskId: z.string().optional(),
      rating: z.number().nullable().optional(),
      reviewsCount: z.number().nullable().optional(),
      reviews: z.array(looseObjectOutputSchema).optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetBusinessReviewsArgs, context) => {
    if (!args.keyword && !args.taskId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Provide either keyword (to start a reviews crawl) or taskId (to collect one).",
      );
    }

    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}/local`,
    );

    let taskId = args.taskId;
    if (!taskId) {
      const posted = await LocalSeoService.startReviewsFetch(
        {
          projectId: args.projectId,
          keyword: args.keyword ?? "",
          locationCode: args.locationCode ?? DEFAULT_LOCATION_CODE,
          languageCode: args.languageCode ?? DEFAULT_LANGUAGE_CODE,
          depth: args.depth ?? DEFAULT_REVIEWS_DEPTH,
        },
        context.billing,
      );
      taskId = posted.taskId;
    }

    for (let attempt = 0; attempt < REVIEWS_POLL_ATTEMPTS; attempt++) {
      const outcome = await LocalSeoService.getReviewsResult(taskId);
      if (outcome.status === "failed") {
        throw new AppError("INTERNAL_ERROR", outcome.message);
      }
      if (outcome.status === "completed") {
        const text =
          outcome.items.length === 0
            ? "The reviews crawl finished but returned no reviews."
            : `Fetched ${outcome.items.length} reviews (profile rating ${outcome.rating ?? "—"}, ${outcome.reviewsCount ?? "—"} total):\n${formatMcpTable(outcome.items, REVIEW_COLUMNS)}`;
        return mcpResponse({
          text,
          meta,
          structuredContent: {
            status: "completed",
            taskId,
            rating: outcome.rating,
            reviewsCount: outcome.reviewsCount,
            reviews: outcome.items,
          },
        });
      }
      if (attempt < REVIEWS_POLL_ATTEMPTS - 1) {
        await sleep(REVIEWS_POLL_INTERVAL_MS);
      }
    }

    return mcpResponse({
      text: `The reviews crawl is still running. Call get_business_reviews again with taskId "${taskId}" in ~30 seconds to collect the result.`,
      meta,
      structuredContent: { status: "pending", taskId },
    });
  }),
};
