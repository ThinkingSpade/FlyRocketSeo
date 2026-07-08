import { z } from "zod";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { isRecord } from "@/server/lib/dataforseo/envelope";
import { projectIdSchema } from "@/server/mcp/schemas";

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

/* ------------------------------------------------------------------ */
/*  get_domain_technologies                                             */
/* ------------------------------------------------------------------ */

const getDomainTechnologiesInputSchema = {
  projectId: projectIdSchema,
  target: domainTargetSchema.describe(
    "Domain (no protocol/www) to detect the technology stack for.",
  ),
} as const;

type GetDomainTechnologiesArgs = z.infer<
  z.ZodObject<typeof getDomainTechnologiesInputSchema>
>;

/**
 * technologies come back as {group: {category: [names]}}; flatten into
 * "group/category: name1, name2" lines for the text block.
 */
function formatTechnologies(technologies: unknown): string[] {
  if (!isRecord(technologies)) return [];
  const lines: string[] = [];
  for (const [group, categories] of Object.entries(technologies)) {
    if (!isRecord(categories)) continue;
    for (const [category, names] of Object.entries(categories)) {
      if (!Array.isArray(names) || names.length === 0) continue;
      lines.push(
        `- ${group}/${category}: ${names.filter((name) => typeof name === "string").join(", ")}`,
      );
    }
  }
  return lines;
}

export const getDomainTechnologiesTool = {
  name: "get_domain_technologies",
  config: {
    title: "Get domain technologies",
    description:
      "Detects a website's technology stack (CMS, frameworks, analytics, e-commerce, CDN, and more) plus its title, description, country, and domain rank. Charges credits.",
    inputSchema: getDomainTechnologiesInputSchema,
    outputSchema: {
      technologies: looseObjectOutputSchema.nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetDomainTechnologiesArgs, context) => {
      const client = createDataforseoClient(context.billing);
      const result = await client.domainAnalytics.technologies({
        target: args.target,
      });

      let text: string;
      if (!result) {
        text = `No technology data found for ${args.target}.`;
      } else {
        const lines = formatTechnologies(result.technologies);
        text = [
          `Technology stack for ${args.target}:`,
          `- title: ${result.title ?? "—"}`,
          `- domain rank: ${result.domain_rank ?? "—"}`,
          `- country: ${result.country_iso_code ?? "—"}`,
          ...(lines.length > 0 ? lines : ["- no technologies detected"]),
        ].join("\n");
      }
      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/domain`,
        ),
        structuredContent: { technologies: result ?? null },
      });
    },
  ),
};

/* ------------------------------------------------------------------ */
/*  get_domain_whois                                                    */
/* ------------------------------------------------------------------ */

const getDomainWhoisInputSchema = {
  projectId: projectIdSchema,
  domain: domainTargetSchema.describe(
    "Registrable domain (no protocol/www/subdomain) to look up WHOIS data for.",
  ),
} as const;

type GetDomainWhoisArgs = z.infer<
  z.ZodObject<typeof getDomainWhoisInputSchema>
>;

export const getDomainWhoisTool = {
  name: "get_domain_whois",
  config: {
    title: "Get domain WHOIS",
    description:
      "Returns WHOIS registration data for a domain: creation, update, and expiration dates, registrar, and status codes. Use to check domain age (an authority signal) or expiry. Charges credits.",
    inputSchema: getDomainWhoisInputSchema,
    outputSchema: {
      whois: looseObjectOutputSchema.nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetDomainWhoisArgs, context) => {
    const client = createDataforseoClient(context.billing);
    const whois = await client.domainAnalytics.whois({ domain: args.domain });

    const text = whois
      ? [
          `WHOIS for ${args.domain}:`,
          `- registered: ${whois.registered == null ? "—" : whois.registered ? "yes" : "no"}`,
          `- created: ${whois.created_datetime ?? "—"}`,
          `- updated: ${whois.updated_datetime ?? whois.changed_datetime ?? "—"}`,
          `- expires: ${whois.expiration_datetime ?? "—"}`,
          `- registrar: ${whois.registrar ?? "—"}`,
          `- status: ${whois.epp_status_codes?.join(", ") ?? "—"}`,
        ].join("\n")
      : `No WHOIS record found for ${args.domain}.`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/domain`,
      ),
      structuredContent: { whois: whois ?? null },
    });
  }),
};
