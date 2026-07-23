// Pure branded/non-branded classification for GSC queries (no I/O), split
// out so the matching rules are unit-testable.

export type QueryTotals = {
  query: string;
  clicks: number;
  impressions: number;
};

type BrandedSplit = {
  branded: { queries: number; clicks: number; impressions: number };
  nonBranded: { queries: number; clicks: number; impressions: number };
  /** Branded clicks / total clicks, 0..1, or null when there are no clicks. */
  brandedClickShare: number | null;
  /** The branded queries with the most clicks, for the card's examples. */
  topBranded: QueryTotals[];
};

/**
 * Default brand term from a domain: the registrable stem ("deliotx.com" →
 * "deliotx"). Users can add more terms (e.g. misspellings) in the UI.
 */
export function defaultBrandTerms(domain: string): string[] {
  const stem = domain
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".")[0]
    ?.trim();
  return stem ? [stem] : [];
}

export function parseBrandTerms(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .split(",")
        .map((term) => term.replace(/\s+/g, " ").trim())
        .filter((term) => term.length >= 2),
    ),
  ];
}

/**
 * Shortest word we will treat as a clipped brand, and the most characters the
 * brand may have that the word does not.
 *
 * Both bounds exist to keep this from swallowing generic words: "shop" is four
 * characters and a prefix of "shopify", but three characters short of it, and
 * nobody searching "shop" means Shopify. "car" is a prefix of "carpetworld" and
 * fails on both counts.
 */
const MIN_CLIPPED_BRAND = 4;
const MAX_CLIPPED_SUFFIX = 2;

/** A tail that only pluralises the word it follows. */
const INFLECTIONAL_PLURAL = /^e?s$/;

/**
 * A query is branded when any term appears with spaces ignored ("delio tx"
 * matches the term "deliotx"), or when a word in the query is the term minus a
 * short tail.
 *
 * That second rule exists because the brand term comes from the domain stem,
 * and people search the brand, not the domain: deliotx.com yields the term
 * "deliotx" while the actual top Search Console query is "delio". Containment
 * alone reads that as non-branded, which is how brand traffic came to be
 * ranked as the best topic to research.
 */
export function isBrandedQuery(query: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const normalized = query.toLowerCase();
  const squashed = normalized.replace(/\s+/g, "");
  const words = normalized.split(/\s+/).filter(Boolean);

  return terms.some((term) => {
    if (normalized.includes(term)) return true;
    const squashedTerm = term.replace(/\s+/g, "");
    if (squashed.includes(squashedTerm)) return true;
    return words.some((word) => {
      if (word.length < MIN_CLIPPED_BRAND) return false;
      if (!squashedTerm.startsWith(word)) return false;
      const removed = squashedTerm.slice(word.length);
      if (removed.length > MAX_CLIPPED_SUFFIX) return false;
      // "roofers" minus "roofer" is the term's own plural, not a clipped
      // brand. Service businesses name themselves after the plural of what
      // they do, so without this a roofers.com project would file "roofer
      // near me" -- its single most valuable non-branded query -- as brand
      // traffic, which is the very mistake this function exists to avoid.
      return !INFLECTIONAL_PLURAL.test(removed);
    });
  });
}

export function computeBrandedSplit(
  rows: QueryTotals[],
  terms: string[],
): BrandedSplit {
  const branded = { queries: 0, clicks: 0, impressions: 0 };
  const nonBranded = { queries: 0, clicks: 0, impressions: 0 };
  const topBranded: QueryTotals[] = [];

  for (const row of rows) {
    const bucket = isBrandedQuery(row.query, terms) ? branded : nonBranded;
    bucket.queries += 1;
    bucket.clicks += row.clicks;
    bucket.impressions += row.impressions;
    if (bucket === branded) topBranded.push(row);
  }

  const totalClicks = branded.clicks + nonBranded.clicks;
  return {
    branded,
    nonBranded,
    brandedClickShare: totalClicks > 0 ? branded.clicks / totalClicks : null,
    // Rows arrive sorted by clicks, so the first branded rows are the top ones.
    topBranded: topBranded.slice(0, 5),
  };
}
