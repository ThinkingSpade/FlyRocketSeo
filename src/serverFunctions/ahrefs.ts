import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { chunk } from "remeda";
import { z } from "zod";
import { ahrefsRatingFromValue } from "@/shared/ahrefsRating";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { requireProjectContext } from "@/serverFunctions/middleware";

/**
 * Ahrefs publishes a free, keyless Domain Rating lookup. We use it to enrich the
 * Backlinks table on demand — no billing, no stored data. Every result (a DR, or
 * `null` when Ahrefs has no rating) is cached in KV for a day so re-opening the
 * table is free.
 */
const AHREFS_DR_ENDPOINT =
  "https://api.ahrefs.com/v3/public/domain-rating-free";
// v2: entries written before the 0-vs-null fix below stored `null` for a
// domain Ahrefs actually rated 0, and those live for 24h. Reading them back
// would keep the old meaning alive for a day after deploy, so the key space
// moves instead. The stale `ahrefs-dr:` keys expire on their own TTL.
const CACHE_PREFIX = "ahrefs-dr:v2:";
const CACHE_TTL_SECONDS = 86_400; // 24 hours
const FETCH_TIMEOUT_MS = 5_000;
const FETCH_BATCH_SIZE = 20;
const MAX_DOMAINS_PER_CALL = 100;

const domainRatingsInputSchema = z.object({
  projectId: z.string().min(1),
  domains: z.array(z.string().trim().min(1).max(253)).max(MAX_DOMAINS_PER_CALL),
});

const ahrefsResponseSchema = z.object({
  domain_rating: z.object({
    domain_rating: z.number().min(0).max(100),
  }),
});

export const getAhrefsDomainRatings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(domainRatingsInputSchema)
  .handler(async ({ data }) => {
    const result: Record<string, number | null> = {};

    // Several original inputs can collapse to one normalized domain (www/non-www,
    // protocol variants). Resolve each normalized domain once, then fan the value
    // back out to every original key the client will look up by.
    const originalsByDomain = new Map<string, string[]>();
    for (const original of data.domains) {
      const domain = normalizeDomainInput(original, true);
      const existing = originalsByDomain.get(domain);
      if (existing) existing.push(original);
      else originalsByDomain.set(domain, [original]);
    }

    const ratings = new Map<string, number | null>();
    for (const batch of chunk(
      [...originalsByDomain.keys()],
      FETCH_BATCH_SIZE,
    )) {
      const resolved = await Promise.all(
        batch.map(async (domain) => {
          // A single failure (KV blip, etc.) must not fail the whole call.
          try {
            return [domain, await resolveDomainRating(domain)] as const;
          } catch {
            return [domain, null] as const;
          }
        }),
      );
      for (const [domain, dr] of resolved) ratings.set(domain, dr);
    }

    for (const [domain, originals] of originalsByDomain) {
      const dr = ratings.get(domain) ?? null;
      for (const original of originals) result[original] = dr;
    }

    return result;
  });

/** Cache-first lookup for a single normalized domain. */
async function resolveDomainRating(domain: string): Promise<number | null> {
  const cacheKey = `${CACHE_PREFIX}${domain}`;
  // KV returns JS `null` only when the key is absent; a cached "no rating" is
  // stored as the string "null", so cache hits (including nulls) skip the fetch.
  const cached = await env.KV.get(cacheKey);
  if (cached !== null) return parseCachedRating(cached);

  const dr = await fetchDomainRating(domain);
  await env.KV.put(cacheKey, JSON.stringify(dr), {
    expirationTtl: CACHE_TTL_SECONDS,
  });
  return dr;
}

async function fetchDomainRating(domain: string): Promise<number | null> {
  const response = await fetch(
    `${AHREFS_DR_ENDPOINT}?target=${encodeURIComponent(domain)}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!response.ok) {
    throw new Error(`Ahrefs DR lookup failed with status ${response.status}`);
  }

  const parsed = ahrefsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Ahrefs DR lookup returned an unexpected response");
  }

  // Kept verbatim, INCLUDING 0 -- see ahrefsRating.ts for why that one line
  // mattered and what null is now allowed to mean. A failed request throws
  // above and is caught by the caller, which is the only path to an unknown.
  return ahrefsRatingFromValue(parsed.data.domain_rating.domain_rating);
}

function parseCachedRating(raw: string): number | null {
  try {
    // Same rule as a fresh fetch, so a cache hit and a cache miss can never
    // disagree about what 0 means.
    return ahrefsRatingFromValue(JSON.parse(raw));
  } catch {
    return null;
  }
}
