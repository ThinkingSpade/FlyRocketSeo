/**
 * Chooses which keywords to ask "who outranks me on this?" about.
 *
 * Pure and provider-agnostic on purpose: the input row shape is
 * `SearchPerformanceDimensionRow`'s, so the orchestrator can pass GSC rows
 * straight in, but nothing here touches the network — which is what makes the
 * selection rules testable in a deployment with no API keys.
 */

/** Matches `SearchPerformanceDimensionRow` (gsc/searchPerformanceReport.ts). */
export type SeedInputRow = {
  key: string;
  impressions: number;
  position: number;
};

export type SeedQuery = {
  keyword: string;
  impressions: number;
  /** The client's own average position for this query, per GSC. */
  selfPosition: number;
};

export type CompetitorSeed = {
  keywords: SeedQuery[];
  droppedBranded: number;
  totalConsidered: number;
};

/** Keywords sent to `serp_competitors` in one request. */
export const COMPETITOR_SEED_SIZE = 40;

/**
 * Below this, the seed is not representative of the client's market and the
 * caller should fall back to domain-seeded discovery rather than pay for an
 * answer drawn from a handful of queries.
 */
export const MIN_COMPETITOR_SEED = 5;

function parseBrandTerms(brandTerms: string): string[] {
  return brandTerms
    .split("\n")
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
}

function isBranded(keyword: string, terms: string[]): boolean {
  const haystack = keyword.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

export function buildCompetitorSeed(
  rows: SeedInputRow[],
  options: { brandTerms: string; limit?: number },
): CompetitorSeed {
  const limit = options.limit ?? COMPETITOR_SEED_SIZE;
  const terms = parseBrandTerms(options.brandTerms);

  let droppedBranded = 0;
  const candidates: SeedQuery[] = [];
  for (const row of rows) {
    if (!row.key) continue;
    if (terms.length > 0 && isBranded(row.key, terms)) {
      droppedBranded += 1;
      continue;
    }
    candidates.push({
      keyword: row.key,
      impressions: row.impressions,
      selfPosition: row.position,
    });
  }

  const byImpressions = (a: SeedQuery, b: SeedQuery) =>
    b.impressions - a.impressions;

  // A query the client already ranks #1 for cannot surface a rival above them,
  // so it is only worth spending seed budget on once the contested queries run
  // out -- hence two tiers rather than one sort.
  const contested = candidates
    .filter((c) => c.selfPosition > 1.5)
    .sort(byImpressions);
  const owned = candidates
    .filter((c) => c.selfPosition <= 1.5)
    .sort(byImpressions);

  return {
    keywords: [...contested, ...owned].slice(0, limit),
    droppedBranded,
    totalConsidered: rows.length,
  };
}
