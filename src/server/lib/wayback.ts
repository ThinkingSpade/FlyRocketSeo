import { z } from "zod";

/**
 * Did this domain ever host a real site?
 *
 * The Wayback availability endpoint is free and needs no key, which is what
 * makes the acquirable-domain search affordable: it separates a genuinely
 * dropped domain -- one that had content and later lapsed -- from a name nobody
 * ever registered. Only names that pass this are worth spending an APIVerve
 * availability credit on.
 *
 * `true` archived, `false` never archived, `null` we could not tell.
 *
 * The `null` matters. Wayback is a free public service with no SLA, and
 * collapsing a blip to `false` would silently discard a real acquisition target
 * as "never existed" -- the same rule as every other lookup in this feature.
 */
const AVAILABILITY_ENDPOINT = "https://archive.org/wayback/available";
const FETCH_TIMEOUT_MS = 6_000;

export const ARCHIVE_CACHE_PREFIX = "wayback-archived:v1:";
/**
 * 30 days. Whether a domain EVER hosted a site is close to immutable -- it can
 * only ever flip from false to true -- so this is cached hard. That matters
 * twice over: archive.org rate-limits (429 observed in practice), so every
 * cache hit is both a faster run and one less request against a free service.
 */
export const ARCHIVE_CACHE_TTL_SECONDS = 2_592_000;

const responseSchema = z.object({
  archived_snapshots: z.object({
    closest: z.object({ available: z.boolean() }).optional(),
  }),
});

export async function hadArchivedSite(
  domain: string,
  cache?: {
    get(key: string): Promise<string | null>;
    put(
      key: string,
      value: string,
      options: { expirationTtl: number },
    ): Promise<void>;
  },
): Promise<boolean | null> {
  const cacheKey = `${ARCHIVE_CACHE_PREFIX}${domain}`;
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached === "true") return true;
    if (cached === "false") return false;
  }

  const url = new URL(AVAILABILITY_ENDPOINT);
  url.searchParams.set("url", domain);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  try {
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const archived = parsed.data.archived_snapshots.closest?.available === true;
    // Only a real answer is cached; caching a 429 would suppress retries for a
    // month over a transient throttle.
    await cache?.put(cacheKey, String(archived), {
      expirationTtl: ARCHIVE_CACHE_TTL_SECONDS,
    });
    return archived;
  } catch {
    return null;
  }
}
