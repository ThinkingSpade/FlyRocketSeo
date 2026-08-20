import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  MAX_DOMAINS_PER_CALL,
  resolveDomainExpiration,
  resolveDomainExpirations,
  type ExpirationCache,
} from "@/server/lib/apiverve/domainExpiration";
import { requireProjectContext } from "@/serverFunctions/middleware";

/**
 * Domain expiry for one domain, cache-first. Billed at 5 APIVerve credits on a
 * cache miss and free for the next seven days, so callers must gate this
 * behind an explicit user action -- see DomainExpirationCard's useAuthorizedRun.
 *
 * Glue only: the transport, the error mapping and the cache codec all live in
 * `src/server/lib/apiverve/`, because this module's `cloudflare:workers`
 * import puts it out of reach of the node-environment test suite.
 */
const inputSchema = z.object({
  projectId: z.string().min(1),
  domain: z.string().trim().min(1).max(253),
});

export const getDomainExpiration = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(inputSchema)
  .handler(async ({ data }) => {
    const cache: ExpirationCache = {
      get: (key) => env.KV.get(key),
      put: (key, value, options) => env.KV.put(key, value, options),
    };

    // Domain normalization happens inside resolveDomainExpiration, not here --
    // it is the one choke point every caller shares, so a subdomain can never
    // open a second cache entry or a second charge.
    return resolveDomainExpiration(data.domain, cache, Date.now());
  });

const bulkInputSchema = z.object({
  projectId: z.string().min(1),
  domains: z
    .array(z.string().trim().min(1).max(253))
    .min(1)
    .max(MAX_DOMAINS_PER_CALL),
});

/**
 * Domain expiry for many domains at once, for table enrichment.
 *
 * Billed at 5 APIVerve credits per uncached domain, so a full page of a
 * backlinks table is real money. Every caller must gate this behind an
 * explicit, PER-PAGE user action.
 *
 * That "per-page" is not a style preference. The Ahrefs DR column next door
 * keeps enriching new domains on every pagination once opted in a single time
 * (see the effect in BacklinksPageSections) -- correct there, because that
 * endpoint is free and keyless. Copying it here would turn one click into a
 * charge for every page the user happens to scroll past.
 *
 * Returns a plain record so the client can look domains up directly; a domain
 * whose lookup failed maps to `null`, which means UNKNOWN and never "fine".
 */
export const getDomainExpirations = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(bulkInputSchema)
  .handler(async ({ data }) => {
    const cache: ExpirationCache = {
      get: (key) => env.KV.get(key),
      put: (key, value, options) => env.KV.put(key, value, options),
    };

    const resolved = await resolveDomainExpirations(
      data.domains,
      cache,
      Date.now(),
    );
    return Object.fromEntries(resolved);
  });
