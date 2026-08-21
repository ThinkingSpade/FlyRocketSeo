import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { gradeStoredDomainRatings } from "@/server/features/expired-domains/services/gradeStoredDomainRatings";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { MAX_DOMAIN_RATING_LOOKUPS } from "@/shared/workerQueryBudget";

const inputSchema = z.object({
  projectId: z.string().min(1),
  domains: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_DOMAIN_RATING_LOOKUPS),
});

/**
 * Grade one project's pending harvested domains immediately.
 *
 * Free and isolated from harvesting and availability: this module calls only
 * Ahrefs' keyless DR endpoint, has no APIVerve dependency, and has no spend
 * gate. Nothing invokes the action except the explicit Grade now click.
 */
export const gradeHarvestedDomainsNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(inputSchema)
  .handler(async ({ context, data }) => {
    return gradeStoredDomainRatings(
      context.projectId,
      {
        get: (key) => env.KV.get(key),
        put: (key, value, options) => env.KV.put(key, value, options),
      },
      data.domains,
    );
  });
