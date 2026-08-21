import { z } from "zod";
import { ahrefsRatingFromValue } from "@/shared/ahrefsRating";

/**
 * Ahrefs' free, keyless Domain Rating lookup.
 *
 * Extracted from `serverFunctions/ahrefs.ts` so it can be reached from places
 * that are not a server function -- the scheduled deleted-domain harvest grades
 * its shortlist here -- and so the cache semantics are testable at all. That
 * file statically imports `cloudflare:workers`, which puts it out of reach of
 * this repo's node-environment Vitest.
 *
 * The cache is a parameter rather than `env.KV` for the same reason.
 */
const AHREFS_DR_ENDPOINT =
  "https://api.ahrefs.com/v3/public/domain-rating-free";
// v2: entries written before the 0-vs-null fix stored `null` for a domain
// Ahrefs actually rated 0. The key space moved rather than waiting out a TTL.
const DR_CACHE_PREFIX = "ahrefs-dr:v2:";
const DR_CACHE_TTL_SECONDS = 86_400;
const FETCH_TIMEOUT_MS = 5_000;

export type RatingCache = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options: { expirationTtl: number },
  ): Promise<void>;
};

const ahrefsResponseSchema = z.object({
  domain_rating: z.object({
    domain_rating: z.number().min(0).max(100),
  }),
});

/**
 * Cache-first DR for one normalized domain.
 *
 * `null` means "we did not get an answer" and NOTHING else. A rating of 0 is
 * kept verbatim as 0 -- collapsing it to null once destroyed the difference
 * between "no authority" and "unknown" and silently switched off a whole
 * ranking verdict. See `shared/ahrefsRating.ts`.
 */
export async function resolveDomainRating(
  domain: string,
  cache: RatingCache,
): Promise<number | null> {
  const cacheKey = `${DR_CACHE_PREFIX}${domain}`;
  // KV returns JS `null` only when the key is absent; a cached "no rating" is
  // stored as the string "null", so cache hits (including nulls) skip the fetch.
  const cached = await cache.get(cacheKey);
  if (cached !== null) return parseCachedRating(cached);

  const rating = await fetchDomainRating(domain);
  await cache.put(cacheKey, JSON.stringify(rating), {
    expirationTtl: DR_CACHE_TTL_SECONDS,
  });
  return rating;
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
