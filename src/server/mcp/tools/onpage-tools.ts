import { z } from "zod";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { InstantPageAuditItem } from "@/server/lib/dataforseo/onpage";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

/* ------------------------------------------------------------------ */
/*  audit_page                                                          */
/* ------------------------------------------------------------------ */

const auditPageInputSchema = {
  projectId: projectIdSchema,
  url: z
    .string()
    .min(1)
    .max(2048)
    .regex(/^https?:\/\/\S+$/, "Use an absolute URL including protocol.")
    .describe("Absolute page URL to audit."),
  enableJavascript: z
    .boolean()
    .optional()
    .describe(
      "Render the page with a browser (JS execution). Slower and pricier; needed for accurate results on client-rendered apps. Defaults to false.",
    ),
} as const;

type AuditPageArgs = z.infer<z.ZodObject<typeof auditPageInputSchema>>;

// Checks where `true` indicates a problem (most on-page checks follow this
// convention; the "is_" prefixed ones describe state rather than problems).
const NON_ISSUE_CHECK_PREFIXES = ["is_", "has_", "seo_friendly_url"];

function isIssueCheck(name: string): boolean {
  return !NON_ISSUE_CHECK_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function collectFailedChecks(item: InstantPageAuditItem): string[] {
  return Object.entries(item.checks ?? {})
    .filter(([name, value]) => value === true && isIssueCheck(name))
    .map(([name]) => name)
    .toSorted();
}

function formatAuditText(url: string, item: InstantPageAuditItem): string {
  const failed = collectFailedChecks(item);
  const meta = item.meta;
  const lines = [
    `On-page audit for ${url}:`,
    `- status: ${item.status_code ?? "—"}`,
    `- on-page score: ${item.onpage_score ?? "—"} / 100`,
    `- title (${meta?.title_length ?? "—"} chars): ${meta?.title ?? "—"}`,
    `- description (${meta?.description_length ?? "—"} chars): ${meta?.description ?? "—"}`,
    `- canonical: ${meta?.canonical ?? "—"}`,
    `- word count: ${meta?.content?.plain_text_word_count ?? "—"}`,
    `- internal links: ${meta?.internal_links_count ?? "—"}, external links: ${meta?.external_links_count ?? "—"}, images: ${meta?.images_count ?? "—"}`,
  ];
  if (item.page_timing?.largest_contentful_paint != null) {
    lines.push(`- LCP: ${item.page_timing.largest_contentful_paint}ms`);
  }
  lines.push(
    failed.length === 0
      ? "- issues: none detected"
      : `- issues (${failed.length}): ${failed.join(", ")}`,
  );
  return lines.join("\n");
}

export const auditPageTool = {
  name: "audit_page",
  config: {
    title: "Audit page",
    description:
      "Runs a live technical SEO audit of a single URL: on-page score, failed checks (duplicate/missing meta, thin content, redirects, and ~60 more), title/description, content stats, and load timing. Use the Site Audit feature for whole-site crawls; use this to spot-check any page instantly. Charges credits.",
    inputSchema: auditPageInputSchema,
    outputSchema: {
      page: looseObjectOutputSchema.nullable(),
      failedChecks: z.array(z.string()),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: AuditPageArgs, context) => {
    const client = createDataforseoClient(context.billing);
    const item = await client.onPage.instantPage({
      url: args.url,
      enableJavascript: args.enableJavascript,
    });

    const text = item
      ? formatAuditText(args.url, item)
      : `Could not audit ${args.url} — the crawler returned no page data.`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/audit`,
      ),
      structuredContent: {
        page: item ?? null,
        failedChecks: item ? collectFailedChecks(item) : [],
      },
    });
  }),
};
