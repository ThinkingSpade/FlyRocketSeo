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
 * THE HONESTY REQUIREMENT this exists to protect: a directory not appearing
 * in these results means "not found in this search", never "the listing
 * does not exist". BrightLocal can say a listing is missing because it owns
 * a crawled index; we only ever have one search's worth of organic results,
 * so every sentence below is written to keep that distinction visible
 * rather than collapsing it into a confident-sounding total.
 */

export type CitationSerpResult = {
  domain: string | null;
  url: string | null;
  title: string | null;
};

export type CitationBusiness = {
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
};

export type CitationReport = {
  found: CitationMatch[];
  /** Empty whenever coverage can't be judged honestly (see the thin-data
   *  branch below) -- never populated just to show a scary-looking count. */
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

// The one action this model ever proposes: below the broken-link-recovery
// tier used elsewhere (backlinks.ts's 100), since creating a fresh listing
// is real work, not a free reclaim -- but still the clear next step whenever
// there's a gap.
const ACTION_WEIGHT_MISSING_DIRECTORIES = 80;

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

/** True when `resultDomain` is the directory's own domain, a subdomain of
 *  it (e.g. `business.yelp.com`), or one of its confident country-variant
 *  aliases (e.g. `yelp.co.uk`) -- see directories.ts for why aliases stay a
 *  short, explicit list rather than a guessed TLD-swap rule. */
function matchesDirectory(
  resultDomain: string,
  directory: DirectoryEntry,
): boolean {
  const normalized = normalizeDomain(resultDomain);
  const candidates = [directory.domain, ...(directory.aliases ?? [])];
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeDomain(candidate);
    return (
      normalized === normalizedCandidate ||
      normalized.endsWith(`.${normalizedCandidate}`)
    );
  });
}

/** Every known directory that appears among `results`, each with the first
 *  (i.e. highest-ranked) matching URL. A plain nested loop over ~20
 *  directories times a page of results is a few hundred comparisons at
 *  most -- not worth a map-based lookup. */
function findCitations(results: CitationSerpResult[]): CitationMatch[] {
  const found: CitationMatch[] = [];
  for (const directory of DIRECTORIES) {
    for (const result of results) {
      if (
        result.domain &&
        result.url &&
        matchesDirectory(result.domain, directory)
      ) {
        found.push({ directory, url: result.url });
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

export function buildCitationReport(input: {
  business: CitationBusiness;
  results: CitationSerpResult[];
}): CitationReport {
  const { business, results } = input;
  const label = subjectLabel(business);

  if (results.length < minReliableResults(business)) {
    return {
      // A genuine match is still real evidence even in a thin sample --
      // only the *absence* claim ("missing") is unreliable this early, so
      // that's the one withheld below, not both.
      found: findCitations(results),
      missing: [],
      verdict: unknownVerdict(
        `Only ${results.length} organic ${pluralResults(results.length)} came back for ${label} -- too few to judge citation coverage one way or the other.`,
      ),
    };
  }

  const found = findCitations(results);
  const foundIds = new Set(found.map((match) => match.directory.id));
  const missing = DIRECTORIES.filter(
    (directory) => !foundIds.has(directory.id),
  );
  const total = DIRECTORIES.length;

  const tone: VerdictTone =
    missing.length === 0 ? "good" : found.length === 0 ? "bad" : "mixed";

  const read =
    tone === "good"
      ? `${label} showed up in search for all ${total} directories on this list. A strong footprint among the majors -- though this list isn't every citation that could exist.`
      : tone === "bad"
        ? `${label} didn't show up in search for any of the ${total} directories on this list. That doesn't confirm the listings don't exist, only that they didn't surface for this search -- worth checking the biggest ones by hand.`
        : `${label} showed up in search for ${found.length} of ${total} directories on this list. The other ${missing.length} didn't surface in this search -- that means not found here, not confirmed missing.`;

  const actions: Verdict["actions"] =
    missing.length > 0
      ? [
          {
            label: "Create listings on the directories that didn't surface",
            evidence: `${missing.length} of ${total} not found in this search`,
            weight: ACTION_WEIGHT_MISSING_DIRECTORIES,
          },
        ]
      : [];

  return { found, missing, verdict: { read, tone, actions } };
}
