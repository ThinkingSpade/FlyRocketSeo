import { z } from "zod";
import { apiverveGet } from "@/server/lib/apiverve/client";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { AppError } from "@/server/lib/errors";
import {
  deriveDomainExpiration,
  type DomainExpiration,
  type DomainExpirationFacts,
} from "@/shared/domainExpiration";

export const CACHE_PREFIX = "apiverve-domain-exp:v1:";
export const CACHE_TTL_SECONDS = 604_800; // 7 days

/**
 * The slice of KVNamespace this module needs, taken as a parameter rather than
 * imported from `cloudflare:workers`. That keeps this file importable by the
 * node-environment Vitest suite, which is the only way the "counts down across
 * a cached entry" test can exist at all.
 */
export type ExpirationCache = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options: { expirationTtl: number },
  ): Promise<void>;
};

/**
 * Only the absolute dates are read off the wire. The derived day counts
 * APIVerve also returns are deliberately discarded -- they are correct only at
 * the instant of the call, and caching them is the silent-drift bug.
 */
const responseSchema = z.object({
  data: z.object({
    domain: z.string(),
    expirationDate: z.string().nullish(),
    createdDate: z.string().nullish(),
    lastUpdatedDate: z.string().nullish(),
  }),
});

const cachedFactsSchema = z.object({
  domain: z.string(),
  expirationDate: z.string().nullable(),
  createdDate: z.string().nullable(),
  lastUpdatedDate: z.string().nullable(),
});

export async function resolveDomainExpiration(
  rawDomain: string,
  cache: ExpirationCache,
  nowMs: number,
): Promise<DomainExpiration> {
  // Normalizing HERE, not at each call site, is deliberate. Registration is a
  // property of the registrable domain (eTLD+1) -- a subdomain has no expiry of
  // its own -- so `blog.example.com`, `www.example.com` and
  // `https://example.com/pricing` must all resolve to ONE cache entry and ONE
  // billed call. When each caller normalized for itself the MCP tool forgot to,
  // which split the cache key and double-charged for the same domain. A choke
  // point makes that unrepresentable.
  const domain = normalizeDomainInput(rawDomain, false);
  const cacheKey = `${CACHE_PREFIX}${domain}`;

  const cached = await cache.get(cacheKey);
  if (cached !== null) {
    const cachedFacts = parseCachedFacts(cached);
    // A corrupt entry falls through to a fresh fetch rather than throwing: a
    // bad cache write must not make a domain permanently unreadable.
    if (cachedFacts) return deriveDomainExpiration(cachedFacts, nowMs);
  }

  const facts = await fetchDomainExpirationFacts(domain);
  await cache.put(cacheKey, JSON.stringify(facts), {
    expirationTtl: CACHE_TTL_SECONDS,
  });
  return deriveDomainExpiration(facts, nowMs);
}

async function fetchDomainExpirationFacts(
  domain: string,
): Promise<DomainExpirationFacts> {
  const body = await apiverveGet("domainexpiration", { domain });
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "APIVerve returned an unexpected domain expiration response",
    );
  }

  return {
    domain: parsed.data.data.domain,
    expirationDate: parsed.data.data.expirationDate ?? null,
    createdDate: parsed.data.data.createdDate ?? null,
    lastUpdatedDate: parsed.data.data.lastUpdatedDate ?? null,
  };
}

function parseCachedFacts(raw: string): DomainExpirationFacts | null {
  try {
    const parsed = cachedFactsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const MAX_DOMAINS_PER_CALL = 100;
/** APIVerve rate-limits per minute, so Ahrefs' batch of 20 would trip it. */
export const FETCH_CONCURRENCY = 5;

/**
 * Resolve many domains at once, keyed by their NORMALIZED form so the returned
 * map agrees with the cache and with what a single `resolveDomainExpiration`
 * would have produced.
 *
 * Two deliberate behaviours:
 *
 * - One domain failing degrades THAT entry to `null` and never takes the batch
 *   down. `null` means "unknown", which the finder counts and reports rather
 *   than quietly treating as healthy.
 * - An over-cap request THROWS instead of truncating. A silently shortened
 *   sweep is worse than a refusal, because the caller would go on to report
 *   "none expired" over domains it never actually checked.
 */
export async function resolveDomainExpirations(
  domains: string[],
  cache: ExpirationCache,
  nowMs: number,
): Promise<Map<string, DomainExpiration | null>> {
  if (domains.length > MAX_DOMAINS_PER_CALL) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Too many domains: ${domains.length} exceeds the cap of ${MAX_DOMAINS_PER_CALL}`,
    );
  }

  // Normalize and dedupe BEFORE spending: two spellings of one registrable
  // domain must cost one call, not two.
  const unique = [
    ...new Set(
      domains.map((domain) => {
        try {
          return normalizeDomainInput(domain, false);
        } catch {
          return "";
        }
      }),
    ),
  ].filter(Boolean);

  const results = new Map<string, DomainExpiration | null>();
  for (let index = 0; index < unique.length; index += FETCH_CONCURRENCY) {
    const batch = unique.slice(index, index + FETCH_CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (domain) => {
        try {
          return [
            domain,
            await resolveDomainExpiration(domain, cache, nowMs),
          ] as const;
        } catch {
          return [domain, null] as const;
        }
      }),
    );
    for (const [domain, value] of settled) results.set(domain, value);
  }
  return results;
}
