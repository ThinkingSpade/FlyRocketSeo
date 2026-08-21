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

  // Canonicalized, not merely lowercased: a project domain stored as
  // "https://www.BigVending.com/" must still exclude "bigvending.com", or the
  // project's own domain is harvested as a candidate and can consume a paid
  // availability check.
  const excluded = new Set(input.exclude.map(canonicalHost));
  const seen = new Set<string>();
  const matches: VocabularyMatch[] = [];

  for (const raw of input.domains) {
    const domain = canonicalHost(raw);
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

/** Bare registrable host: strips scheme, `www.`, path, and case. */
function canonicalHost(value: string): string {
  let host = value.trim().toLowerCase();
  const scheme = host.indexOf("://");
  if (scheme !== -1) host = host.slice(scheme + 3);
  const slash = host.indexOf("/");
  if (slash !== -1) host = host.slice(0, slash);
  if (host.startsWith("www.")) host = host.slice(4);
  return host;
}

/**
 * A matcher that consumes domains one at a time, for streaming callers.
 *
 * Exists so a day's feed never has to be materialized as an array: the
 * buffering version allocated ~240,000 strings and measured 70 ms of CPU,
 * against 6 ms for a streamed pass that stops early.
 *
 * The terms are compiled into ONE alternation instead of N `includes` calls per
 * domain, which is where most of the remaining time goes: 84,000 domains times
 * 30 terms is 2.5 million string scans, and a single regex does it in one.
 *
 * `accept` returns false once the cap is reached, which is the caller's signal
 * to cancel the stream rather than decompress the rest of the file.
 */
export function createVocabularyMatcher(input: {
  terms: string[];
  exclude: string[];
  limit: number;
}): {
  accept: (domain: string) => boolean;
  matches: VocabularyMatch[];
} {
  const terms = input.terms
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= MIN_TERM_LENGTH && isSafeTerm(term))
    .toSorted((a, b) => b.length - a.length);

  const matches: VocabularyMatch[] = [];
  if (terms.length === 0) return { accept: () => false, matches };

  const excluded = new Set(input.exclude.map(canonicalHost));
  const seen = new Set<string>();
  // Longest-first alternation, so the most specific term is the one reported.
  const pattern = new RegExp(terms.join("|"));

  return {
    accept(raw: string): boolean {
      if (matches.length >= input.limit) return false;

      const domain = canonicalHost(raw);
      if (!domain || seen.has(domain) || excluded.has(domain)) return true;

      const dot = domain.lastIndexOf(".");
      const stem = dot === -1 ? domain : domain.slice(0, dot);
      const hit = pattern.exec(stem);
      if (!hit) return true;

      seen.add(domain);
      matches.push({ domain, matchedTerm: hit[0] });
      return matches.length < input.limit;
    },
    matches,
  };
}

/**
 * Terms reaching this point are already alphanumeric -- seed terms come from
 * splitting on non-alphanumerics, and model terms are validated against
 * `[a-z]{3,20}`. Anything else is dropped here rather than escaped, so a term
 * can never smuggle regex syntax into the alternation.
 */
function isSafeTerm(term: string): boolean {
  return /^[a-z0-9]+$/.test(term);
}
