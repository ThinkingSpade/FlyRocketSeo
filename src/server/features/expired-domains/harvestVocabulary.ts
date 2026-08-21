import { deriveAdjacentTerms } from "@/server/features/expired-domains/adjacentTerms";
import { deriveSeedTerms } from "@/shared/domainNameCandidates";

/**
 * The full vocabulary a project's harvest matches against.
 *
 * Two halves, and the second is what makes the feature worth the subscription:
 *
 *  - SEED terms come from the project's own keywords and profile. They can only
 *    ever describe the client's own trade -- for a vending operator, "vending".
 *  - ADJACENT terms come from a model and reach the industries AROUND it: the
 *    verticals its customers are in, the venues it operates in, and topics it
 *    could credibly publish about. A vending operator serves schools, so an
 *    education domain is a legitimate target even though education is not its
 *    trade.
 *
 * Without the second half a harvest returns more of the same vertical, which is
 * exactly what the first real run did.
 *
 * The combined list is cached per project because deriving it costs a model
 * call and the answer barely moves: a business's surrounding industries are the
 * same next week. The cache is a parameter so this stays testable.
 */
type VocabularyCache = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options: { expirationTtl: number },
  ): Promise<void>;
};

export const VOCABULARY_CACHE_PREFIX = "harvest-vocab:v1:";
/** 30 days. Re-derived when a project's keywords change enough to matter. */
export const VOCABULARY_TTL_SECONDS = 2_592_000;

export async function resolveHarvestVocabulary(input: {
  projectId: string;
  keywords: string[];
  profileText: string;
  cache: VocabularyCache;
  /** Injected so tests need no model. */
  deriveAdjacent?: (terms: string[]) => Promise<string[]>;
}): Promise<{ seed: string[]; adjacent: string[]; all: string[] }> {
  const seed = deriveSeedTerms(input.keywords, input.profileText);
  if (seed.length === 0) return { seed: [], adjacent: [], all: [] };

  const cacheKey = await vocabularyCacheKey(
    input.projectId,
    seed,
    input.profileText,
  );
  const cached = await input.cache.get(cacheKey);
  if (cached) {
    const adjacent = parseCachedTerms(cached);
    if (adjacent) return { seed, adjacent, all: merge(seed, adjacent) };
  }

  const derive = input.deriveAdjacent ?? deriveAdjacentTerms;
  // Never fatal: no model configured, or a failed call, simply means the
  // harvest runs on the client's own vocabulary -- narrower, but working.
  const adjacent = await derive(seed).catch(() => []);

  // Only a non-empty answer is cached; caching an empty one would lock the
  // harvest into the narrow vocabulary for a month over a transient failure.
  if (adjacent.length > 0) {
    await input.cache.put(cacheKey, JSON.stringify(adjacent), {
      expirationTtl: VOCABULARY_TTL_SECONDS,
    });
  }

  return { seed, adjacent, all: merge(seed, adjacent) };
}

/** Content-addresses the model answer so old project inputs cannot be reused. */
async function vocabularyCacheKey(
  projectId: string,
  seed: string[],
  profileText: string,
): Promise<string> {
  const normalizedSeed = [...new Set(seed.map(normalizeCacheInput))].toSorted();
  const normalizedProfile = normalizeCacheInput(profileText);
  const material = JSON.stringify({
    seed: normalizedSeed,
    profileText: normalizedProfile,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${VOCABULARY_CACHE_PREFIX}${projectId}:${hash}`;
}

function normalizeCacheInput(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function merge(seed: string[], adjacent: string[]): string[] {
  return [...new Set([...seed, ...adjacent])];
}

function parseCachedTerms(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const terms = parsed.filter(
      (value): value is string => typeof value === "string",
    );
    return terms.length > 0 ? terms : null;
  } catch {
    return null;
  }
}
