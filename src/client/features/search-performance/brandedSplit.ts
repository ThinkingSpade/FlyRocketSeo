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
