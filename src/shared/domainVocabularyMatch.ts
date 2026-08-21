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
 * Weak substring hits cannot stop the stream when they fill the cap: a stronger
 * boundary hit may still arrive later and replace one. `accept` returns false
 * only when boundary hits fill the cap, because no later match can outrank
 * those and the caller may then stop decompressing the file for this matcher.
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
  // Global iteration lets one domain's later boundary hit outrank an earlier
  // mid-word collision without reintroducing a loop over every term.
  const pattern = new RegExp(terms.join("|"), "g");
  let boundaryMatches = 0;

  return {
    accept(raw: string): boolean {
      if (boundaryMatches >= input.limit) return false;

      const domain = canonicalHost(raw);
      if (!domain || seen.has(domain) || excluded.has(domain)) return true;

      const dot = domain.lastIndexOf(".");
      const stem = dot === -1 ? domain : domain.slice(0, dot);
      pattern.lastIndex = 0;

      let firstHit: RegExpExecArray | null = null;
      let boundaryHit: RegExpExecArray | null = null;
      let hit: RegExpExecArray | null;
      while ((hit = pattern.exec(stem)) !== null) {
        firstHit ??= hit;
        if (touchesBoundary(stem, hit.index, hit[0].length)) {
          boundaryHit = hit;
          break;
        }
        // A later occurrence may overlap this weak one and touch a boundary.
        // Advance one character, not the full match, so it is still considered.
        pattern.lastIndex = hit.index + 1;
      }

      const bestHit = boundaryHit ?? firstHit;
      if (!bestHit) return true;

      const match = { domain, matchedTerm: bestHit[0] };
      if (boundaryHit) {
        seen.add(domain);
        // Keep the public array stable while ranking boundary hits before weak
        // ones. At most `limit` items move, never the 84k-row feed.
        matches.splice(boundaryMatches, 0, match);
        boundaryMatches += 1;
        if (matches.length > input.limit) matches.pop();
        return boundaryMatches < input.limit;
      }

      // Once weak hits fill the cap, later weak hits cannot improve it. They are
      // ignored without ending the stream so a later boundary hit can replace
      // one of the retained fallbacks.
      if (matches.length < input.limit) {
        seen.add(domain);
        matches.push(match);
      }
      return true;
    },
    matches,
  };
}

/** Whether a term touches either edge of the stem or a non-word separator. */
function touchesBoundary(stem: string, start: number, length: number): boolean {
  const end = start + length;
  return (
    start === 0 ||
    end === stem.length ||
    !isAsciiAlphanumericAt(stem, start - 1) ||
    !isAsciiAlphanumericAt(stem, end)
  );
}

function isAsciiAlphanumericAt(value: string, index: number): boolean {
  if (index < 0 || index >= value.length) return false;
  const code = value.charCodeAt(index);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90)
  );
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
