/**
 * Whether a returned keyword is actually about the seed.
 *
 * `related_keywords` walks Google's "searches related to" graph, and each hop
 * can change the subject: a walk from "delio" reached "obnoxious meaning" in
 * three steps. The only previous acceptance test counted rows, so 46 keywords
 * about the meaning of names passed it.
 *
 * The rule is "shares at least one meaningful word with the seed" rather than a
 * similarity threshold, because a threshold deletes genuine lateral keywords —
 * "break room coffee" shares only one word with "office coffee service" and is
 * exactly the kind of suggestion the tab exists to surface.
 */

/** Enough shared prefix to be a stem ("service"/"services") rather than a
 *  coincidence ("delio"/"dealio", which share only "de"). */
const MIN_STEM_PREFIX = 4;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "best",
  "by",
  "do",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "near",
  "of",
  "on",
  "or",
  "the",
  "to",
  "top",
  "vs",
  "what",
  "why",
  "with",
]);

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

export function tokenizeSeed(seed: string): string[] {
  const tokens = tokenize(seed);
  const meaningful = tokens.filter((token) => !STOPWORDS.has(token));
  // A seed made entirely of stopwords ("how to") still has to match something.
  return meaningful.length > 0 ? meaningful : tokens;
}

function tokensMatch(seedToken: string, keywordToken: string): boolean {
  if (seedToken === keywordToken) return true;
  const shorter =
    seedToken.length <= keywordToken.length ? seedToken : keywordToken;
  const longer =
    seedToken.length <= keywordToken.length ? keywordToken : seedToken;
  return shorter.length >= MIN_STEM_PREFIX && longer.startsWith(shorter);
}

export function scoreRelevance(keyword: string, seedTokens: string[]): number {
  if (seedTokens.length === 0) return 1;
  const keywordTokens = tokenize(keyword);
  const matched = seedTokens.filter((seedToken) =>
    keywordTokens.some((keywordToken) => tokensMatch(seedToken, keywordToken)),
  ).length;
  return matched / seedTokens.length;
}

export function isOffTopic(keyword: string, seedTokens: string[]): boolean {
  return scoreRelevance(keyword, seedTokens) === 0;
}
