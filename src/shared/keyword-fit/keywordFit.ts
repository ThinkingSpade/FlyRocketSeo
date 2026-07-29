import { INTENT_FAMILIES, type IntentFamily } from "./intentFamilies";

/**
 * Decides whether a keyword belongs to the client's customer, using nothing
 * but the profile they typed. No API key, no model call, no network -- which
 * is the point: a deployment with no OPENROUTER_API_KEY still gets the verdict
 * that matters most, and the semantic pass (Phase 2) refines rather than
 * replaces it.
 *
 * The unit of judgement is the EXCLUSION LINE, not the keyword. Each line the
 * user writes ("we don't sell machines") is parsed once into the commercial
 * role it rules out plus the object it rules it out for, and every keyword is
 * then tested against those. Reasons quote the user's own line back, so a
 * wrong verdict is legible as a wrong exclusion rather than an opaque score.
 */

export type FitVerdict = "on-offer" | "adjacent" | "wrong-customer";

export type FitResult = {
  verdict: FitVerdict;
  /** Plain-language justification, safe to render directly. */
  reason: string;
};

/** One parsed exclusion line. */
type Exclusion = {
  /** The user's own words, quoted back in reasons. */
  source: string;
  family: IntentFamily;
  /**
   * The thing the family is ruled out FOR ("machines"), when the line names
   * one. Null means the line named a role but no object, which restricts
   * matching to that family's `strong` surfaces only.
   */
  object: string | null;
};

// Dropped before looking for an exclusion's object: negation and filler that
// would otherwise be mistaken for the noun being excluded.
const EXCLUSION_STOPWORDS = new Set([
  "we",
  "i",
  "our",
  "us",
  "do",
  "does",
  "dont",
  "doesnt",
  "not",
  "no",
  "never",
  "any",
  "are",
  "is",
  "am",
  "be",
  "was",
  "were",
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "and",
  "or",
  "but",
  "only",
  "just",
  "own",
  "new",
  "used",
]);

/**
 * Lowercase, strip punctuation to spaces, collapse runs of whitespace.
 *
 * Apostrophes are DELETED rather than turned into spaces, so "don't" becomes
 * "dont" (one stopword) instead of "don t" (two tokens, neither recognizable).
 * Without this every "we don't sell X" line extracted "don" as its excluded
 * object and matched nothing.
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['‘’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Crude singular/plural fold: "machines" and "machine" must match, and a real
 * stemmer is far more machinery than one noun comparison needs.
 *
 * The `-es` branch is deliberately narrow. Stripping two characters from
 * anything ending in "es" turned "machines" into "machin", which silently
 * broke every object comparison in this module -- only true -es plurals
 * (boxes, churches, buses) lose both. Words of three characters or fewer are
 * left alone so "gas" does not become "ga", and "-ss" words are never touched
 * so "business" survives.
 */
function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ss")) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(?:s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function stemAll(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean).map(stem);
}

/** Whether `phrase` (already normalized) occurs in `haystack` on word
 *  boundaries -- so "used" does not match "unused" and "buy" does not match
 *  "buyer's guide" via a bare substring test. */
function containsPhrase(haystack: string, phrase: string): boolean {
  const words = haystack.split(" ");
  const target = phrase.split(" ");
  if (target.length === 1) {
    return words.some((word) => word === target[0] || stem(word) === target[0]);
  }
  for (let i = 0; i <= words.length - target.length; i += 1) {
    if (target.every((part, offset) => words[i + offset] === part)) return true;
  }
  return false;
}

/**
 * Parses one exclusion line into the role it rules out and the object it rules
 * it out for.
 *
 * Returns null for a line that names no recognizable commercial role. That is
 * deliberate: an unparseable line must produce NO verdicts rather than a
 * guessed one, because a false "wrong-customer" hides a keyword the client
 * actually wanted. The profile editor surfaces which lines parsed, so a line
 * that does nothing is visible rather than silently ignored.
 */
export function parseExclusionLine(line: string): Exclusion | null {
  const normalized = normalizeText(line);
  if (!normalized) return null;

  const family = INTENT_FAMILIES.find((candidate) =>
    candidate.triggers.some((trigger) => containsPhrase(normalized, trigger)),
  );
  if (!family) return null;

  // The object is whatever content word survives after removing filler and
  // the trigger words themselves -- "we don't sell machines" -> "machines".
  const triggerStems = new Set(family.triggers.map(stem));
  const object =
    normalized
      .split(" ")
      .filter(
        (word) =>
          !EXCLUSION_STOPWORDS.has(word) && !triggerStems.has(stem(word)),
      )
      .map(stem)[0] ?? null;

  return { source: line.trim(), family, object };
}

export function parseExclusions(exclusions: string): Exclusion[] {
  return exclusions
    .split(/[\n;]+/)
    .map(parseExclusionLine)
    .filter((parsed): parsed is Exclusion => parsed !== null);
}

/**
 * Whether `keyword` trips `exclusion`.
 *
 * A `strong` surface is enough alone. A `weak` one needs the excluded object
 * present too -- see intentFamilies.ts for why "price" must never flag on its
 * own.
 */
function matchesExclusion(
  normalizedKeyword: string,
  stems: readonly string[],
  exclusion: Exclusion,
): boolean {
  const hasObject =
    exclusion.object !== null && stems.includes(exclusion.object);

  if (
    exclusion.family.strong.some((surface) =>
      containsPhrase(normalizedKeyword, surface),
    )
  ) {
    // An exclusion that named an object still scopes its strong surfaces to
    // that object when the keyword mentions any object at all -- otherwise
    // "office coffee for sale" would be flagged by "we don't sell machines".
    return exclusion.object === null || hasObject;
  }

  return (
    hasObject &&
    exclusion.family.weak.some((surface) =>
      containsPhrase(normalizedKeyword, surface),
    )
  );
}

/** Content words from the offer, used to separate "clearly ours" from merely
 *  "not excluded". Short filler is dropped so every keyword doesn't match on
 *  "and"/"for". */
export function offerTerms(offer: string): string[] {
  return stemAll(offer).filter(
    (word) => word.length > 3 && !EXCLUSION_STOPWORDS.has(word),
  );
}

export type FitProfile = {
  offer: string;
  exclusions: string;
};

/**
 * Classifies one keyword.
 *
 * Ordering matters: exclusions win over the offer, because the whole failure
 * this addresses is a keyword that looks on-topic ("vending machines for sale
 * dfw" shares "vending" with the offer) while belonging to someone else's
 * customer.
 */
export function classifyKeyword(
  keyword: string,
  profile: FitProfile,
): FitResult {
  const normalizedKeyword = normalizeText(keyword);
  const stems = stemAll(keyword);

  for (const exclusion of parseExclusions(profile.exclusions)) {
    if (matchesExclusion(normalizedKeyword, stems, exclusion)) {
      return {
        verdict: "wrong-customer",
        reason: `Looks like ${exclusion.family.description} — you said “${exclusion.source}”`,
      };
    }
  }

  const terms = offerTerms(profile.offer);
  const hit = terms.find((term) => stems.includes(term));
  if (hit) {
    return { verdict: "on-offer", reason: `Matches your offer (“${hit}”)` };
  }

  return {
    verdict: "adjacent",
    reason: "Related to your market but not clearly part of what you offer",
  };
}

/**
 * Whether a profile can produce any verdict at all. An empty profile must
 * leave the results table exactly as it was rather than labelling every row
 * "adjacent", which would be noise dressed up as analysis.
 */
export function hasUsableProfile(profile: FitProfile): boolean {
  return (
    parseExclusions(profile.exclusions).length > 0 ||
    offerTerms(profile.offer).length > 0
  );
}
