import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  resolveDomainExpiration,
  type ExpirationCache,
} from "@/server/lib/apiverve/domainExpiration";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { domainTargetSchema, projectIdSchema } from "@/server/mcp/schemas";

const expirationOutputSchema = z.object({
  domain: z.string(),
  expirationDate: z.string().nullable(),
  createdDate: z.string().nullable(),
  lastUpdatedDate: z.string().nullable(),
  daysToExpiration: z.number().nullable(),
  domainAgeDays: z.number().nullable(),
  domainAgeYears: z.number().nullable(),
  daysSinceLastUpdate: z.number().nullable(),
  status: z.enum(["expired", "critical", "warning", "healthy"]).nullable(),
});

const getDomainExpirationInputSchema = {
  projectId: projectIdSchema,
  domain: domainTargetSchema.describe(
    "Registrable domain (no protocol/www/subdomain) to check registration expiry for.",
  ),
} as const;

type GetDomainExpirationArgs = z.infer<
  z.ZodObject<typeof getDomainExpirationInputSchema>
>;

export const getDomainExpirationTool = {
  name: "get_domain_expiration",
  config: {
    title: "Get domain expiration",
    description:
      "Returns a domain's registration expiry date, days remaining, health status and age. Does NOT charge DataForSEO credits — prefer this over get_domain_whois when only expiry or age is needed.",
    inputSchema: getDomainExpirationInputSchema,
    outputSchema: {
      expiration: expirationOutputSchema.nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetDomainExpirationArgs, context) => {
      const cache: ExpirationCache = {
        get: (key) => env.KV.get(key),
        put: (key, value, options) => env.KV.put(key, value, options),
      };
      const expiration = await resolveDomainExpiration(
        args.domain,
        cache,
        Date.now(),
      );

      const text = [
        `Registration for ${expiration.domain}:`,
        `- expires: ${expiration.expirationDate ?? "—"}`,
        `- days remaining: ${expiration.daysToExpiration ?? "unknown"}`,
        `- status: ${expiration.status ?? "unknown"}`,
        `- age: ${
          expiration.domainAgeYears == null
            ? "unknown"
            : `${expiration.domainAgeYears} years`
        }`,
      ].join("\n");

      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/domain`,
        ),
        structuredContent: { expiration },
      });
    },
  ),
};
