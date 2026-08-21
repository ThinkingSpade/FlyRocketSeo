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

const VOCABULARY_CACHE_PREFIX = "harvest-vocab:v2:";
const LEGACY_VOCABULARY_CACHE_PREFIX = "harvest-vocab:v1:";
const UNCATEGORISED_TERM_CATEGORY = "uncategorised";
/** 30 days. Re-derived when a project's keywords change enough to matter. */
export const VOCABULARY_TTL_SECONDS = 2_592_000;

type HarvestVocabulary = {
  seed: string[];
  adjacent: string[];
  all: string[];
  categoryByTerm: Record<string, string>;
};

type CachedVocabulary = {
  terms: string[];
  categoryByTerm: Record<string, string>;
};

export async function resolveHarvestVocabulary(input: {
  projectId: string;
  keywords: string[];
  profileText: string;
  cache: VocabularyCache;
  /**
   * Model generation is paid. Only an explicit user action may pass true;
   * scheduled callers can still consume an already-cached adjacent vocabulary.
   */
  allowModelDerivation: boolean;
  /** Injected so tests need no model. */
  deriveAdjacent?: (terms: string[]) => Promise<string[]>;
}): Promise<HarvestVocabulary> {
  const seed = deriveSeedTerms(input.keywords, input.profileText);
  if (seed.length === 0) {
    return { seed: [], adjacent: [], all: [], categoryByTerm: {} };
  }

  const { cacheKey, legacyCacheKey } = await vocabularyCacheKeys(
    input.projectId,
    seed,
  );
  const cached = await input.cache.get(cacheKey);
  if (cached) {
    const vocabulary = parseCachedVocabulary(cached);
    if (vocabulary) return mergeVocabulary(seed, vocabulary);
  }

  // Keep deployed v1 arrays useful until their original TTL expires. Reads do
  // not copy them forward: the next real derivation writes the v2 shape.
  const legacy = await input.cache.get(legacyCacheKey);
  if (legacy) {
    const vocabulary = parseCachedVocabulary(legacy);
    if (vocabulary) return mergeVocabulary(seed, vocabulary);
  }

  const derive = input.deriveAdjacent ?? deriveAdjacentTerms;
  // Never fatal: no model configured, a failed call, or an automatic caller
  // means the harvest runs on the client's own vocabulary -- narrower, but
  // working. Cached adjacent terms were already returned above at no cost.
  const adjacent = input.allowModelDerivation
    ? await derive(seed).catch(() => [])
    : [];

  // Only a non-empty answer is cached; caching an empty one would lock the
  // harvest into the narrow vocabulary for a month over a transient failure.
  if (adjacent.length > 0) {
    const cachedVocabulary: CachedVocabulary = {
      terms: adjacent,
      categoryByTerm: categoriesFor(adjacent),
    };
    try {
      await input.cache.put(cacheKey, JSON.stringify(cachedVocabulary), {
        expirationTtl: VOCABULARY_TTL_SECONDS,
      });
    } catch {
      // The model answer has already been paid for. A cache outage must not
      // discard it and force the next harvest to buy the same answer again.
    }
  }

  return mergeVocabulary(seed, {
    terms: adjacent,
    categoryByTerm: categoriesFor(adjacent),
  });
}

/** Content-addresses the model answer so old project inputs cannot be reused. */
async function vocabularyCacheKeys(
  projectId: string,
  seed: string[],
): Promise<{ cacheKey: string; legacyCacheKey: string }> {
  const normalizedSeed = [...new Set(seed.map(normalizeCacheInput))].toSorted();
  const material = JSON.stringify({ seed: normalizedSeed });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return {
    cacheKey: `${VOCABULARY_CACHE_PREFIX}${projectId}:${hash}`,
    legacyCacheKey: `${LEGACY_VOCABULARY_CACHE_PREFIX}${projectId}:${hash}`,
  };
}

function normalizeCacheInput(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function merge(seed: string[], adjacent: string[]): string[] {
  return [...new Set([...seed, ...adjacent])];
}

function mergeVocabulary(
  seed: string[],
  adjacent: CachedVocabulary,
): HarvestVocabulary {
  const all = merge(seed, adjacent.terms);
  const categoryByTerm = categoriesFor(all);
  const seedTerms = new Set(seed);

  for (const term of adjacent.terms) {
    if (!seedTerms.has(term)) {
      categoryByTerm[term] =
        adjacent.categoryByTerm[term] ?? UNCATEGORISED_TERM_CATEGORY;
    }
  }

  return { seed, adjacent: adjacent.terms, all, categoryByTerm };
}

function categoriesFor(terms: string[]): Record<string, string> {
  return Object.fromEntries(
    terms.map((term) => [term, UNCATEGORISED_TERM_CATEGORY]),
  );
}

function parseCachedVocabulary(raw: string): CachedVocabulary | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      const terms = parseTerms(parsed);
      return terms.length > 0
        ? { terms, categoryByTerm: categoriesFor(terms) }
        : null;
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.terms)) return null;
    const terms = parseTerms(parsed.terms);
    if (terms.length === 0) return null;
    const rawCategories = isRecord(parsed.categoryByTerm)
      ? parsed.categoryByTerm
      : {};
    const categoryByTerm = Object.fromEntries(
      terms.map((term) => {
        const category = rawCategories[term];
        return [
          term,
          typeof category === "string" && category.trim()
            ? category.trim()
            : UNCATEGORISED_TERM_CATEGORY,
        ];
      }),
    );
    return { terms, categoryByTerm };
  } catch {
    return null;
  }
}

function parseTerms(values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
