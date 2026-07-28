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
 * every read (see geoLocationSeedStore.ts, which persists a ~95k-row derived
 * list as newline-delimited JSON so a later reader can fetch one small byte
 * range instead of the whole object). A caller that writes with this must
 * read with `getCachedRange`/a raw read, never `getCached` (which assumes the
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
