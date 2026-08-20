/**
 * Turns what we know about a project into plausible domain names to test.
 *
 * This is the half of the expired-domain finder that reaches OUTSIDE the
 * project's link graph. The graph-based sources can only surface domains that
 * already link to a competitor or rank for a tracked keyword, which by
 * construction returns more of the same vertical. Generating names from the
 * industry's own vocabulary is what lets a vending operator see
 * `nutritionvending.com` rather than a fifth vending company.
 *
 * Pure and dependency-free so every rule here is testable: what counts as an
 * industry word, what is filler, and how many names a run is allowed to
 * produce -- that last one is a spend limit, since each surviving name may cost
 * an availability lookup.
 */

/**
 * Words that appear in nearly every commercial query and generate nothing but
 * noise when combined. "servicesdirect.com" is nobody's industry.
 */
const FILLER = new Set([
  "a",
  "and",
  "at",
  "best",
  "buy",
  "cheap",
  "companies",
  "company",
  "cost",
  "equipment",
  "for",
  "in",
  "machine",
  "machines",
  "me",
  "near",
  "of",
  "price",
  "prices",
  "pro",
  "provider",
  "providers",
  "service",
  "services",
  "solution",
  "solutions",
  "supplier",
  "suppliers",
  "the",
  "to",
  "top",
  "with",
]);

const MIN_TERM_LENGTH = 4;

/**
 * Industry words from the project's own tracked keywords and profile.
 *
 * Deliberately not an LLM call: the keywords ARE the client's vocabulary, and
 * a model asked to "extract the industry" mostly re-states them while adding a
 * chance of drift. Adjacent terms are a separate step, and that one does need
 * outside knowledge.
 */
export function deriveSeedTerms(
  keywords: string[],
  profileText: string,
): string[] {
  const seen = new Set<string>();
  const source = [...keywords, profileText].join(" ").toLowerCase();

  for (const raw of source.split(/[^a-z0-9]+/)) {
    const term = raw.trim();
    if (term.length < MIN_TERM_LENGTH) continue;
    if (FILLER.has(term)) continue;
    if (/^\d+$/.test(term)) continue;
    seen.add(term);
  }

  return [...seen];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Build candidate hostnames.
 *
 * `limit` is a spend guard, not a display cap: every name returned here may go
 * on to cost an availability lookup, so the caller decides how much reach it is
 * willing to pay for.
 */
export function buildDomainNameCandidates(input: {
  /** The client's own industry words. */
  heads: string[];
  /** Neighbouring-industry words -- where the reach comes from. */
  adjacents: string[];
  modifiers: string[];
  tlds: string[];
  /** Domains never to suggest: the project's own, and known competitors. */
  exclude: string[];
  limit: number;
}): string[] {
  const heads = input.heads.map(slug).filter(Boolean);
  const adjacents = input.adjacents.map(slug).filter(Boolean);
  const modifiers = input.modifiers.map(slug).filter(Boolean);
  const tlds = input.tlds.map(slug).filter(Boolean);
  if (heads.length === 0 && adjacents.length === 0) return [];

  const excluded = new Set(input.exclude.map((value) => value.toLowerCase()));

  // Ordered by how likely each shape is to be a real, previously-registered
  // site, so the limit keeps the best rather than an arbitrary slice.
  const stems: string[] = [];
  for (const adjacent of adjacents) {
    for (const head of heads) {
      stems.push(`${adjacent}${head}`, `${head}${adjacent}`);
    }
  }
  for (const head of heads) {
    for (const modifier of modifiers) stems.push(`${head}${modifier}`);
  }
  for (const adjacent of adjacents) {
    for (const modifier of modifiers) stems.push(`${adjacent}${modifier}`);
  }

  const names: string[] = [];
  const seen = new Set<string>();
  for (const stem of stems) {
    if (!stem) continue;
    for (const tld of tlds) {
      const name = `${stem}.${tld}`;
      if (seen.has(name) || excluded.has(name)) continue;
      seen.add(name);
      names.push(name);
      if (names.length >= input.limit) return names;
    }
  }

  return names;
}
