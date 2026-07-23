import {
  defaultBrandTerms,
  isBrandedQuery,
  looksLikeClippedBrand,
} from "@/client/features/search-performance/brandedSplit";

/**
 * Which keyword the keyword-driven analyses start from.
 *
 * Ranking by impressions alone always surfaces the brand, because on every site
 * the brand is the top-impression query — which is how keyword research came to
 * be seeded with "delio". Non-branded queries therefore rank first; branded ones
 * are still offered, marked, and last, so picking one is a decision.
 *
 * Every source here is free: Search Console, then the project's own saved
 * keywords out of D1.
 */

export type SeedSuggestion = {
  keyword: string;
  hint: string;
  branded: boolean;
};

const DEFAULT_LIMIT = 5;

/** Sites rank at or near the top for their own name; nobody ranks third for
 *  "bakery near me" by accident. */
const MAX_BRAND_POSITION = 3;

function compact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

/** Keeps each side in its incoming order, so the ranking within a side holds. */
function nonBrandedFirst(rows: SeedSuggestion[]): SeedSuggestion[] {
  return [
    ...rows.filter((row) => !row.branded),
    ...rows.filter((row) => row.branded),
  ];
}

export function rankSeedSuggestions({
  gscQueries,
  savedKeywords,
  domain,
  limit = DEFAULT_LIMIT,
}: {
  gscQueries: { query: string; impressions: number; position: number }[];
  savedKeywords: { keyword: string; searchVolume: number | null }[];
  domain: string;
  limit?: number;
}): SeedSuggestion[] {
  const terms = domain ? defaultBrandTerms(domain) : [];
  const byImpressions = gscQueries.toSorted(
    (a, b) => b.impressions - a.impressions,
  );

  const fromGsc = byImpressions.map((row) => ({
    keyword: row.query,
    hint: `${compact(row.impressions)} impressions · pos ${row.position.toFixed(1)}`,
    // A clipped brand is corroborated with position, never taken on shape
    // alone. "deliotx" minus "tx" is the brand; "bakerytx" minus "tx" is the
    // word bakery, and the two are indistinguishable as strings. A site ranks
    // at the top for its own name, so position is the evidence that separates
    // them -- and getting it wrong the other way would bury the best seed a
    // generic-domain site has.
    branded:
      isBrandedQuery(row.query, terms) ||
      (row.position <= MAX_BRAND_POSITION &&
        looksLikeClippedBrand(row.query, terms)),
  }));

  if (fromGsc.length > 0) return nonBrandedFirst(fromGsc).slice(0, limit);

  const fromSaved = savedKeywords.map((row) => ({
    keyword: row.keyword,
    hint:
      row.searchVolume != null
        ? `${compact(row.searchVolume)}/mo saved`
        : "saved keyword",
    branded: isBrandedQuery(row.keyword, terms),
  }));

  // Ordered the same way as the Search Console path. A project with no Search
  // Console data yet is the one most likely to have saved its own brand as a
  // keyword, so this fallback is where leading with the brand would hurt most.
  return nonBrandedFirst(fromSaved).slice(0, limit);
}
