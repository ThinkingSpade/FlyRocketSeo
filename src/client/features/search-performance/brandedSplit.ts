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
 * nobody searching "shop" means Shopify. "car" is a prefix of "carpetworld"
 * and fails on both counts.
 */
const MIN_CLIPPED_BRAND = 4;
const MAX_CLIPPED_SUFFIX = 2;

/** Sites rank at or near the top for their own name; nobody ranks third for
 *  "bakery near me" by accident. */
const MAX_BRAND_POSITION = 3;

/** A query is branded when any term appears with spaces ignored ("delio tx"
 *  matches the term "deliotx"). */
export function isBrandedQuery(query: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const normalized = query.toLowerCase();
  const squashed = normalized.replace(/\s+/g, "");
  return terms.some(
    (term) =>
      normalized.includes(term) || squashed.includes(term.replace(/\s+/g, "")),
  );
}

/**
 * Whether a query word looks like the brand term with a short tail removed —
 * "delio" against the term "deliotx".
 *
 * Needed because the term is the domain stem while people search the brand:
 * deliotx.com yields "deliotx" but its top query is "delio", which containment
 * alone reads as non-branded.
 *
 * **Shape alone cannot decide it, which is why this is deliberately separate
 * from `isBrandedQuery`.** "deliotx" minus "tx" is a clipped brand;
 * "bakerytx" minus "tx" is the word bakery. Identical shape, opposite answer —
 * and `<generic word> + co / tx / hq / us` is one of the commonest
 * small-business domain patterns, where that generic head is the single most
 * valuable NON-branded query the site has. Folding this into `isBrandedQuery`
 * would file "coffee near me" as brand traffic for coffeeco.com.
 *
 * Callers must corroborate it with evidence — see {@link isBrandSeed}.
 */
export function looksLikeClippedBrand(query: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.some((term) => {
    const squashedTerm = term.replace(/\s+/g, "");
    return words.some(
      (word) =>
        word.length >= MIN_CLIPPED_BRAND &&
        squashedTerm.startsWith(word) &&
        squashedTerm.length - word.length <= MAX_CLIPPED_SUFFIX,
    );
  });
}

/**
 * Whether a Search Console query should be treated as the site's own brand
 * when choosing what to seed an analysis with.
 *
 * Ranking queries by impressions alone always surfaces the brand, because on
 * every site the brand is the top-impression query — which is how keyword
 * research came to be seeded with "delio" and returned 46 keywords about the
 * meaning of names.
 *
 * A clipped brand is corroborated with position rather than taken on shape
 * alone: a site ranks at the top for its own name and nowhere near it for
 * "bakery near me", so position is the evidence that separates the two
 * identical-looking cases.
 */
export function isBrandSeed(
  query: string,
  position: number,
  terms: string[],
): boolean {
  return (
    isBrandedQuery(query, terms) ||
    (position <= MAX_BRAND_POSITION && looksLikeClippedBrand(query, terms))
  );
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
