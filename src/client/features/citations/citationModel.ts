import {
  DIRECTORIES,
  type DirectoryEntry,
} from "@/shared/citations/directories";
import {
  unknownVerdict,
  type Verdict,
  type VerdictTone,
} from "@/client/features/insights/types";

/**
 * Reads a citation-discovery search (see the Citation Tracker service) for
 * which of our known directories (directories.ts) turned up, and produces a
 * verdict that never overclaims what a search can actually prove.
 *
 * TWO HONESTY REQUIREMENTS this exists to protect:
 *
 * 1. A directory not appearing in these results means "not found in this
 *    search", never "the listing does not exist". BrightLocal can say a
 *    listing is missing because it owns a crawled index; we only ever have
 *    one search's worth of organic results, so every sentence below is
 *    written to keep that distinction visible rather than collapsing it
 *    into a confident-sounding total -- and this model never advises
 *    creating a listing on the strength of one search's absence, since
 *    creating a duplicate of one that already exists actively harms local
 *    SEO (see the actions built in buildCitationReport).
 * 2. A directory's domain appearing in a result proves the DIRECTORY
 *    appeared, never that the result is this business's own listing -- a
 *    search or category page on that domain matches just as well as an
 *    actual listing does (see isCorroborated). CitationMatch.confirmed
 *    carries that distinction through to callers.
 */

// Not exported: nothing outside this file constructs one of these by name
// today (callers pass an inline object literal to buildCitationReport and
// let structural typing check it) -- CitationMatch/CitationReport below are
// the model's actual cross-file contract, returned to and named by callers.
type CitationSerpResult = {
  domain: string | null;
  url: string | null;
  title: string | null;
};

type CitationBusiness = {
  name: string;
  /** Folded into the verdict's read text when known, so a multi-location
   *  business can tell which location a run is about. */
  city: string | null;
  /** Not read directly -- only whether it's present affects the thin-data
   *  threshold below, alongside `city`. */
  phone: string | null;
};

export type CitationMatch = {
  directory: DirectoryEntry;
  /** The result URL the directory's domain matched against. */
  url: string;
  /**
   * True when a corroborating signal backs up the domain match: the
   * business name recognizable in the result's title, or a URL shaped like
   * an individual listing rather than a search/category page (see
   * isCorroborated). False means only the domain matched -- real evidence
   * the directory appeared, but not that this particular result is this
   * business's own listing (finding 10): a directory's own search page
   * matches the domain just as well as an actual listing does. Callers must
   * not present an unconfirmed match as "your listing".
   */
  confirmed: boolean;
};

export type CitationReport = {
  /** CONFIRMED matches only (finding A1) -- the "N of total" figure and any
   *  positive verdict tone are computed from this array's length alone. An
   *  unconfirmed domain match is real evidence the directory appeared, but
   *  not that this business is listed there, so it must never inflate
   *  coverage -- see `unconfirmed` below for where it's reported instead. */
  found: CitationMatch[];
  /** Domain matched, but not corroborated as this business's own listing
   *  (CitationMatch.confirmed === false for every entry here) -- reported
   *  separately so a caller can label the group honestly ("appeared, but we
   *  could not confirm it's your listing") instead of folding it into either
   *  `found`'s coverage count or `missing`'s absence claim. */
  unconfirmed: CitationMatch[];
  /** Directories that did not appear in these results AT ALL -- confirmed or
   *  not. Empty whenever coverage can't be judged honestly (see the
   *  thin-data branch below) -- never populated just to show a
   *  scary-looking count. */
  missing: DirectoryEntry[];
  verdict: Verdict;
};

// Below this many organic results, a "not found" reading is more likely a
// side effect of a too-narrow search than genuine absence. Two tiers: a
// query anchored to a phone number or city is already disambiguated, so a
// handful of real results is enough to trust; a bare business name returns
// far more incidental noise (other locations, unrelated businesses with a
// similar name, directory category pages) before absence becomes credible.
// Both numbers are reasonable starting points, not derived from measured
// data -- we have none yet -- and are worth revisiting once real runs show
// whether they're too strict or too loose.
const MIN_RESULTS_DISAMBIGUATED = 3;
const MIN_RESULTS_NAME_ONLY = 6;

// The one action this model ever proposes: a prompt to verify by hand, never
// a directive to create anything (finding 11 -- acting on one search's
// absence by creating a listing risks a duplicate wherever one already
// exists, which actively harms local SEO). Weighted below the
// broken-link-recovery tier used elsewhere (backlinks.ts's 100): still worth
// following up on, but a manual check is a lighter ask than fixing a
// confirmed broken link.
const ACTION_WEIGHT_VERIFY_LISTINGS = 80;

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

/** True when `domain` is the directory's own domain, a subdomain of it
 *  (e.g. `business.yelp.com`), or one of its confident country-variant
 *  aliases (e.g. `yelp.co.uk`) -- see directories.ts for why aliases stay a
 *  short, explicit list rather than a guessed TLD-swap rule. */
function matchesDirectory(domain: string, directory: DirectoryEntry): boolean {
  const normalized = normalizeDomain(domain);
  const candidates = [directory.domain, ...(directory.aliases ?? [])];
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeDomain(candidate);
    return (
      normalized === normalizedCandidate ||
      normalized.endsWith(`.${normalizedCandidate}`)
    );
  });
}

/** The result's domain, preferring the explicit `domain` field but falling
 *  back to parsing the host out of `url` when it's absent (finding 12): a
 *  SERP result can carry a real, matchable URL even when the caller didn't
 *  populate `domain`, and ignoring that URL would silently miss a citation
 *  we can already prove surfaced. */
function resultDomain(result: CitationSerpResult): string | null {
  if (result.domain) return result.domain;
  if (!result.url) return null;
  try {
    return new URL(result.url).hostname;
  } catch {
    return null;
  }
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when `name` is recognizable inside `title` -- the clearest signal
 *  available that a specific result is about THIS business, not just some
 *  other page on the same domain. Punctuation and case are normalized away
 *  ("Joe's Pizza" vs "joes pizza") since neither carries meaning here. */
function nameAppearsInTitle(name: string, title: string | null): boolean {
  if (!title) return false;
  const normalizedName = normalizeForMatch(name);
  return (
    normalizedName !== "" && normalizeForMatch(title).includes(normalizedName)
  );
}

// Path segments that mark a directory's own search/category page, or other
// non-listing content, rather than an individual business listing -- e.g.
// Yelp's /search, or a directory's own /blog post. Not an exhaustive list of
// every directory's URL scheme, and DELIBERATELY used only as a
// DISQUALIFIER now (see isClearlyNonListingUrl), never as proof of the
// opposite (final wave item 4): this list used to also stand in for "yes,
// this is a listing" via "not found on this list", which is backwards -- a
// finite blacklist can never enumerate every non-listing path a directory
// might publish (a new editorial section, a fresh URL scheme), so a page
// that simply wasn't on the list -- e.g. /guides/top-pizza -- was wrongly
// treated as listing-shaped. Used as a disqualifier, an incomplete list is
// safe to leave incomplete: missing an entry here just means one more
// non-listing shape falls through to the positive checks below, which still
// default to unconfirmed absent real evidence. Checked against EVERY path
// segment, not just the last one (finding A1): a listing domain's own
// editorial content is often nested under a section prefix (e.g.
// yelp.com/blog/top-pizza), and a last-segment-only check would read that
// slug as though it were an individual listing.
const SEARCH_PAGE_PATH_SEGMENTS = new Set([
  "search",
  "results",
  "category",
  "categories",
  "browse",
  "explore",
  "directory",
  "blog",
  "news",
  "press",
  "help",
  "support",
  "faq",
  "about",
  "careers",
  "terms",
  "privacy",
  "login",
  "signin",
  "signup",
  "pricing",
]);

/** True when some path segment marks `url` as a search/category/editorial
 *  page -- a HARD disqualifier (final wave item 4): a URL this obviously
 *  shaped must never be corroborated, regardless of what its title says. A
 *  bare domain/homepage or an unparseable URL returns false here (not
 *  "clearly" anything) rather than true -- ambiguous is not the same as
 *  disqualifying, so it falls through to the positive checks below instead
 *  of being forced to false ahead of a title match that might still confirm
 *  it. */
function isClearlyNonListingUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  return segments.some((segment) =>
    SEARCH_PAGE_PATH_SEGMENTS.has(segment.toLowerCase()),
  );
}

/** Same idea as normalizeForMatch, but drops apostrophes entirely instead of
 *  turning them into a word break. URL slugs conventionally drop them too
 *  ("Joe's Pizza" -> "joes-pizza", never "joe-s-pizza"), so comparing a
 *  business name against a URL path needs this instead of normalizeForMatch
 *  (which would normalize "Joe's" to "joe s", never matching a slug's
 *  "joes"). Title text doesn't have this problem -- a title is prose, not a
 *  generated slug -- so nameAppearsInTitle keeps using normalizeForMatch. */
function normalizeSlugForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when the business's own name appears somewhere in `url`'s PATH --
 *  positive evidence a result is specifically about this business (finding
 *  10), preferred over blacklist-absence (final wave item 4). Only the
 *  pathname is checked, never the query string: a search URL's query often
 *  carries the searched-for name too (e.g. "?find_desc=Joe%27s+Pizza"),
 *  which would otherwise let a genuine search page slip through as though
 *  its path named the business. */
function urlMentionsBusinessName(name: string, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const normalizedName = normalizeSlugForMatch(name);
  if (!normalizedName) return false;
  return normalizeSlugForMatch(parsed.pathname).includes(normalizedName);
}

/**
 * THE HONESTY REQUIREMENT this exists to protect (finding 10): a domain
 * match only proves the DIRECTORY appeared somewhere in results, never that
 * a specific result is this business's own listing -- a directory's search
 * or category page matches the domain just as well as an actual listing
 * does (e.g. Yelp's own "Top Pizza Restaurants" search page for "yelp.com").
 *
 * Order matters here (final wave item 4): a URL that is clearly a
 * search/category/editorial page is checked FIRST and disqualifies the
 * match outright, before the title is ever consulted. The previous version
 * checked the title first and returned early on a match, so a /search page
 * whose title happened to name the business (a common pattern -- many sites
 * title search pages "<query> - Search results") was confirmed without the
 * URL's shape ever being considered; that is exactly how 19 /search pages
 * became 19 "confirmed" listings. Only once a URL clears that bar does
 * either remaining signal count: the name recognizable in the title, or the
 * name recognizable in the URL's own path (urlMentionsBusinessName) --
 * POSITIVE evidence in both cases, not merely "not on a list of known-bad
 * words". Neither signal alone is proof -- a listing can have a generic
 * title, a business's name could coincidentally appear in an unrelated
 * page's slug -- but either is real evidence, and requiring one raises the
 * bar above "the domain happened to match". Where neither can be
 * established, the match stays unconfirmed.
 */
function isCorroborated(
  business: CitationBusiness,
  result: CitationSerpResult,
): boolean {
  if (result.url != null && isClearlyNonListingUrl(result.url)) return false;
  if (nameAppearsInTitle(business.name, result.title)) return true;
  return (
    result.url != null && urlMentionsBusinessName(business.name, result.url)
  );
}

/** Every known directory that appears among `results`, each with the first
 *  (i.e. highest-ranked) matching URL. A plain nested loop over ~20
 *  directories times a page of results is a few hundred comparisons at
 *  most -- not worth a map-based lookup. */
function findCitations(
  business: CitationBusiness,
  results: CitationSerpResult[],
): CitationMatch[] {
  const found: CitationMatch[] = [];
  for (const directory of DIRECTORIES) {
    for (const result of results) {
      const domain = resultDomain(result);
      if (domain && result.url && matchesDirectory(domain, directory)) {
        found.push({
          directory,
          url: result.url,
          confirmed: isCorroborated(business, result),
        });
        break;
      }
    }
  }
  return found;
}

function subjectLabel(business: CitationBusiness): string {
  return business.city ? `${business.name} in ${business.city}` : business.name;
}

function minReliableResults(business: CitationBusiness): number {
  return business.phone || business.city
    ? MIN_RESULTS_DISAMBIGUATED
    : MIN_RESULTS_NAME_ONLY;
}

function pluralResults(count: number): string {
  return count === 1 ? "result" : "results";
}

function pluralDirectories(count: number): string {
  return count === 1 ? "directory" : "directories";
}

/**
 * A trailing sentence naming the unconfirmed group (finding A1) -- appeared
 * in search, but never corroborated as this business's own listing (see
 * isCorroborated). Appended to every tone's read text rather than folded
 * into the confirmed count itself, so the headline number always means
 * "confirmed", and this stays a clearly separate, honestly-labelled callout.
 */
function unconfirmedNote(unconfirmed: CitationMatch[]): string {
  if (unconfirmed.length === 0) return "";
  return ` ${unconfirmed.length} more ${pluralDirectories(unconfirmed.length)} appeared in search too, but couldn't be confirmed as this business's own listing -- worth checking by hand.`;
}

export function buildCitationReport(input: {
  business: CitationBusiness;
  results: CitationSerpResult[];
}): CitationReport {
  const { business, results } = input;
  const label = subjectLabel(business);

  if (results.length < minReliableResults(business)) {
    // A genuine match is still real evidence even in a thin sample -- only
    // the *absence* claim ("missing") is unreliable this early, so that's
    // the one withheld below, not both. Still split confirmed/unconfirmed
    // (finding A1): an unconfirmed hit is no more trustworthy just because
    // the sample is thin.
    const allMatches = findCitations(business, results);
    return {
      found: allMatches.filter((match) => match.confirmed),
      unconfirmed: allMatches.filter((match) => !match.confirmed),
      missing: [],
      verdict: unknownVerdict(
        `Only ${results.length} organic ${pluralResults(results.length)} came back for ${label} -- too few to judge citation coverage one way or the other.`,
      ),
    };
  }

  const allMatches = findCitations(business, results);
  // Coverage counts CONFIRMED matches only (finding A1): a domain match
  // alone proves the directory appeared, never that this business is the
  // listing that appeared there (see isCorroborated). Folding unconfirmed
  // matches into `found` would let a directory's own search/category page
  // inflate the "N of total" figure and the tone right along with it.
  const found = allMatches.filter((match) => match.confirmed);
  const unconfirmed = allMatches.filter((match) => !match.confirmed);
  // "Missing" means the directory never appeared at all -- confirmed or not.
  // An unconfirmed appearance still rules a directory out of this list; it
  // belongs in `unconfirmed` instead (reported separately above).
  const appearedIds = new Set(allMatches.map((match) => match.directory.id));
  const missing = DIRECTORIES.filter(
    (directory) => !appearedIds.has(directory.id),
  );
  const total = DIRECTORIES.length;

  const tone: VerdictTone =
    found.length === total ? "good" : found.length === 0 ? "bad" : "mixed";

  const read =
    tone === "good"
      ? `${label} showed up in search as a confirmed listing for all ${total} directories on this list. A strong footprint among the majors -- though this list isn't every citation that could exist.`
      : tone === "bad"
        ? `${label} didn't show up in search as a confirmed listing for any of the ${total} directories on this list -- that's not evidence the listings don't exist, only that none were confirmed in this search. A listing may well exist already; worth checking by hand before creating anything new.${unconfirmedNote(unconfirmed)}`
        : `${label} showed up in search as a confirmed listing for ${found.length} of ${total} directories on this list. The other ${missing.length} didn't surface in this search at all -- worth checking manually, since a listing may well exist that just didn't come up here.${unconfirmedNote(unconfirmed)}`;

  const actions: Verdict["actions"] =
    missing.length > 0
      ? [
          {
            label: "Check by hand before creating any new listing",
            evidence: `${missing.length} of ${total} directories didn't surface in this search -- not proof they're missing`,
            weight: ACTION_WEIGHT_VERIFY_LISTINGS,
          },
        ]
      : [];

  return { found, unconfirmed, missing, verdict: { read, tone, actions } };
}
