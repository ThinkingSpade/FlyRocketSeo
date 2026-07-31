import { env } from "cloudflare:workers";
import { sortBy } from "remeda";

/**
 * Cache TTL constants in seconds.
 */
export const CACHE_TTL = {
  /** Related keyword research results */
  researchResult: 86400,
} as const;

const CACHE_PREFIX = "dataforseo-cache/";

/**
 * Where a recorded analysis run keeps its own copy of the result.
 *
 * This prefix exists because the cache prefix above is NOT durable, contrary to
 * what `getCachedRawIgnoringTtl` below used to assume. The bucket carries a
 * lifecycle rule — `dataforseo-cache-expiry`, `prefix: dataforseo-cache/`,
 * "expire objects after 7 days" — that HARD DELETES cached payloads. The code
 * never deletes them, so the assumption looked safe from inside the repo, but
 * Cloudflare does it at the bucket level.
 *
 * The consequence was that `analysis_runs` rows (which live forever in D1)
 * pointed at objects that vanished after a week, so every run older than seven
 * days restored as `null` and the tab silently showed its blank "never run
 * this" state. Verified in production 2026-07-31: an 8-day-old page_explorer
 * run's object was gone, a 2-day-old serp_overview run's object was present.
 *
 * Run payloads therefore get their own copy under this prefix, which must be
 * covered by its own 90-day lifecycle rule rather than the 7-day one. Keep the
 * two prefixes disjoint: the cache is for avoiding PAID re-fetches, this is for
 * letting a user re-open something they already paid for.
 */
const RUN_PAYLOAD_PREFIX = "analysis-runs/";

/**
 * Store a recorded run's result under the durable prefix.
 *
 * Best effort, like the run record itself: history is secondary to the analysis
 * the user already paid for, so a write failure is logged rather than thrown.
 */
export async function putRunPayload(
  cacheKey: string,
  rawJson: string,
): Promise<void> {
  try {
    await env.R2.put(`${RUN_PAYLOAD_PREFIX}${cacheKey}`, rawJson);
  } catch (error) {
    console.error("r2-cache.putRunPayload failed:", error);
  }
}

/** A recorded run's durable copy, or null when it was never written. */
export async function getRunPayload(cacheKey: string): Promise<string | null> {
  const obj = await env.R2.get(`${RUN_PAYLOAD_PREFIX}${cacheKey}`);
  if (!obj) return null;
  return obj.text();
}

/**
 * Build a deterministic cache key from an endpoint slug and input params.
 * Uses a SHA-256 digest for stability across runtimes.
 */
export async function buildCacheKey(
  prefix: string,
  params: Record<string, unknown>,
): Promise<string> {
  const raw = JSON.stringify(
    Object.fromEntries(sortBy(Object.entries(params), ([key]) => key)),
  );

  return `${prefix}:${await sha256Hex(raw)}`;
}

/**
 * Get a cached JSON value from R2. Returns null on miss or expiry.
 * Callers should validate the shape with Zod before trusting it — schema
 * drift between writes and reads is otherwise silent.
 */
export async function getCached(key: string): Promise<unknown> {
  const obj = await env.R2.get(`${CACHE_PREFIX}${key}`);
  if (!obj) return null;

  const expiresAt = obj.customMetadata?.expiresAt;
  if (expiresAt && Date.parse(expiresAt) < Date.now()) return null;

  try {
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

/**
 * Read a cached value even if its soft TTL has lapsed.
 *
 * The TTL here is advisory — `setCached` never deletes, it just stamps
 * `expiresAt`, so an expired object is still sitting in R2. Restoring a past
 * analysis run reads through this: the user gets their previous result back for
 * free instead of triggering a fresh (metered) fetch. Returns null only when
 * the object is genuinely gone or unparseable.
 */
export async function getCachedRawIgnoringTtl(
  key: string,
): Promise<string | null> {
  const obj = await env.R2.get(`${CACHE_PREFIX}${key}`);
  if (!obj) return null;
  return obj.text();
}

/**
 * Store a JSON value in R2 with a soft TTL via custom metadata.
 */
export async function setCached<T>(
  key: string,
  data: T,
  ttlSeconds: number,
): Promise<void> {
  await env.R2.put(`${CACHE_PREFIX}${key}`, JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    },
  });
}

/**
 * Stores raw text verbatim -- no JSON.stringify wrapping. Pairs with
 * `getCachedRange` for values too large to safely re-parse as one document on
 * every read (see geoLocationSeedStore.ts, which persists a derived location
 * list -- originally ~95k rows before that seed feature was scoped to one
 * country, still large enough for the same concern to apply -- as
 * newline-delimited JSON so a later reader can fetch one small byte range
 * instead of the whole object). A caller that writes with this must read
 * with `getCachedRange`/a raw read, never `getCached` (which assumes the
 * stored bytes are exactly one JSON.parse-able document).
 */
export async function setCachedRawText(
  key: string,
  text: string,
  ttlSeconds: number,
): Promise<void> {
  await env.R2.put(`${CACHE_PREFIX}${key}`, text, {
    httpMetadata: { contentType: "application/x-ndjson" },
    customMetadata: {
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    },
  });
}

/**
 * Reads exactly one byte range of a cached value's raw text -- the object
 * itself is never fully read or parsed, only the requested slice. Companion
 * to `setCachedRawText`. Returns null on a missing key, an out-of-bounds
 * range, or any other read failure; callers decide what "not there" means
 * (not staged yet vs. unexpectedly lost).
 */
export async function getCachedRange(
  key: string,
  offset: number,
  length: number,
): Promise<string | null> {
  if (length <= 0) return "";
  try {
    const obj = await env.R2.get(`${CACHE_PREFIX}${key}`, {
      range: { offset, length },
    });
    return obj ? await obj.text() : null;
  } catch {
    return null;
  }
}

/**
 * Compute a deterministic SHA-256 digest for cache keys.
 */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
