/**
 * Narrows a day of dropped domains to the ones worth a project's attention.
 *
 * This is the only filter standing between ~84,000 `.com` names a day and what
 * gets stored and graded, so its rules are pure and tested rather than inlined
 * into the harvest job.
 */

type VocabularyMatch = {
  /** Registrable name, lowercased. */
  domain: string;
  /** The term that hit, so a stored row can explain why it is there. */
  matchedTerm: string;
};

/**
 * Below this length a term matches a meaningful share of all domains --
 * "co" appears in company, coffee, cost, and tens of thousands of others.
 */
const MIN_TERM_LENGTH = 4;

export function matchDomainsToVocabulary(input: {
  domains: string[];
  terms: string[];
  /** Never surface these: the project's own domain and its competitors. */
  exclude: string[];
  limit: number;
}): VocabularyMatch[] {
  const terms = input.terms
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= MIN_TERM_LENGTH)
    // Longest first, so the most specific term wins: a domain containing both
    // "room" and "breakroom" should be explained by "breakroom".
    .toSorted((a, b) => b.length - a.length);
  if (terms.length === 0) return [];

  const excluded = new Set(input.exclude.map((value) => value.toLowerCase()));
  const seen = new Set<string>();
  const matches: VocabularyMatch[] = [];

  for (const raw of input.domains) {
    const domain = raw.trim().toLowerCase();
    if (!domain || seen.has(domain) || excluded.has(domain)) continue;

    // Match the STEM only. Including the TLD would make every `.coffee`
    // domain a hit for "coffee" and flood a harvest with one TLD.
    const dot = domain.lastIndexOf(".");
    const stem = dot === -1 ? domain : domain.slice(0, dot);

    const matchedTerm = terms.find((term) => stem.includes(term));
    if (!matchedTerm) continue;

    seen.add(domain);
    matches.push({ domain, matchedTerm });
    if (matches.length >= input.limit) break;
  }

  return matches;
}
