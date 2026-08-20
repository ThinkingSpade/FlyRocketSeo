import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  resolveDomainExpiration,
  type ExpirationCache,
} from "@/server/lib/apiverve/domainExpiration";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
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
    // `false` = collapse to the registrable domain. A subdomain cannot expire
    // independently, so it must not get its own cache entry or its own charge.
    const domain = normalizeDomainInput(data.domain, false);

    const cache: ExpirationCache = {
      get: (key) => env.KV.get(key),
      put: (key, value, options) => env.KV.put(key, value, options),
    };

    return resolveDomainExpiration(domain, cache, Date.now());
  });
