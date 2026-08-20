import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  resolveDomainExpiration,
  type ExpirationCache,
} from "@/server/lib/apiverve/domainExpiration";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";

/**
 * Resolve the audited domain's registration and pin it to the audit row, so it
 * travels into the client report.
 *
 * Explicit, not part of the crawl. Resolving bills 5 APIVerve credits, and an
 * audit's consent covers the crawl -- running a third-party lookup the user
 * never asked for, on every audit, would be exactly the kind of auto-spend this
 * codebase keeps getting bitten by.
 *
 * Only the ABSOLUTE dates are stored. The day counts are recomputed from the
 * clock wherever the row is read, so a report opened three months later states
 * what is true then rather than what was true on audit day.
 */
const inputSchema = z.object({
  projectId: z.string().min(1),
  auditId: z.string().min(1),
});

export const saveAuditDomainExpiration = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(inputSchema)
  .handler(async ({ data, context }) => {
    const audit = await AuditRepository.getAuditForProject(
      data.auditId,
      context.projectId,
    );
    if (!audit) {
      throw new AppError("NOT_FOUND", "Audit not found for this project");
    }

    const target = audit.startUrl ?? context.project.domain;
    if (!target) {
      throw new AppError(
        "PROJECT_DOMAIN_MISSING",
        "This audit has no domain to look up",
      );
    }

    const cache: ExpirationCache = {
      get: (key) => env.KV.get(key),
      put: (key, value, options) => env.KV.put(key, value, options),
    };

    // Normalization to the registrable domain happens inside the resolver --
    // the audit's startUrl is a full URL, and this is the one choke point that
    // turns it into the key the cache and every other caller already share.
    const expiration = await resolveDomainExpiration(target, cache, Date.now());

    await AuditRepository.setAuditDomainExpiration(
      data.auditId,
      context.projectId,
      JSON.stringify({
        domain: expiration.domain,
        expirationDate: expiration.expirationDate,
        createdDate: expiration.createdDate,
        lastUpdatedDate: expiration.lastUpdatedDate,
      }),
    );

    return expiration;
  });
