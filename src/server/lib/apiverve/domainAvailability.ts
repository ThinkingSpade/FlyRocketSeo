import { z } from "zod";
import { apiverveGet } from "@/server/lib/apiverve/client";
import type { ExpirationCache } from "@/server/lib/apiverve/domainExpiration";
import { normalizeDomainInput } from "@/server/lib/domainUtils";

export const AVAILABILITY_CACHE_PREFIX = "apiverve-domain-avail:v1:";
/**
 * One day, not the expiry lookup's seven. An expiry DATE barely moves, but
 * availability flips the moment a lapsed domain finishes dropping -- and that
 * window is the entire point of checking. A week-stale "taken" would hide it.
 */
export const AVAILABILITY_TTL_SECONDS = 86_400;

const responseSchema = z.object({
  data: z.object({ available: z.boolean() }),
});

/**
 * Is this domain registerable right now?
 *
 * `true` available, `false` taken, `null` we could not tell.
 *
 * The `null` is load-bearing. Collapsing a failed lookup to `false` would
 * render as "taken" and quietly bury a domain that is in fact available --
 * precisely the result this feature exists to surface. Same rule as the Ahrefs
 * DR work: null means exactly one thing, "no answer".
 *
 * Note this answers a different question from expiry. An expired domain sits in
 * redemption / pending-delete for roughly 75 days and is NOT registerable in
 * that window, so "expired" alone is not a buy signal -- this is.
 */
export async function resolveDomainAvailability(
  rawDomain: string,
  cache: ExpirationCache,
): Promise<boolean | null> {
  // Same choke point as the expiry resolver: registration belongs to the
  // registrable domain, so a subdomain must not open a second cache entry or a
  // second charge.
  const domain = normalizeDomainInput(rawDomain, false);
  const cacheKey = `${AVAILABILITY_CACHE_PREFIX}${domain}`;

  const cached = await cache.get(cacheKey);
  if (cached === "true") return true;
  if (cached === "false") return false;

  let available: boolean;
  try {
    const parsed = responseSchema.safeParse(
      await apiverveGet("domainavailability", { domain }),
    );
    if (!parsed.success) return null;
    available = parsed.data.data.available;
  } catch {
    return null;
  }

  // Only a real answer is cached. Caching a failure would suppress retries for
  // a full day over what may have been a momentary blip.
  await cache.put(cacheKey, String(available), {
    expirationTtl: AVAILABILITY_TTL_SECONDS,
  });
  return available;
}
