import {
  isCompetitorRow,
  type CompetitorCategory,
  type DiscoveryMode,
} from "@/types/schemas/competitors";
import { unknownVerdict, type Verdict } from "../types";

/**
 * Reads a competitor list for the one decision it actually supports: which
 * rival is worth chasing.
 *
 * Which field answers that depends on `discoveryMode`, and the two modes are
 * not interchangeable:
 *
 * - "domain" (the domain-overlap fallback): `CompetitorsService.getCompetitors`
 *   orders these results by shared-keyword volume ("Rank by shared-keyword
 *   volume so obvious rivals surface first") -- this module leans on that
 *   same signal, `intersections`, as the one honest measure of "how much of
 *   a rival is this."
 * - "serp" (keyword-seeded discovery): `intersections` is ALWAYS null here
 *   (rankSerpCompetitors.ts sets it explicitly and says why: "Only
 *   meaningful for the domain-overlap endpoint; this path has none"). The
 *   equivalent signal is `beatsYouCount` -- the number of the CLIENT's own
 *   seed keywords this rival outranks them on, which is exactly what serp
 *   discovery was built to measure. Reading `intersections` here would
 *   degrade to "no basis to say which one to chase" on every single serp
 *   run, while the actual answer sat unread in the same rows.
 *
 * This input has no per-keyword data at all (that lives behind a separate,
 * per-competitor metered Keyword Gap call), so unlike the brief's promise of
 * "the first keyword to take," this module can only point at the mechanism
 * that surfaces one -- it cannot name a keyword it was never given.
 *
 * Before either mode-specific reading runs, `buildCompetitorsVerdict` filters
 * `competitors` down to real rivals via `isCompetitorRow` -- the same shared
 * predicate the table UI groups by (decision 6: this must name the top REAL
 * competitor, and must never assert a platform is a rival, in EITHER mode).
 * A platform with the single highest `beatsYouCount`/`intersections` is
 * exactly the bug this batch exists to fix: `youtube.com outranks you on
 * more of your keywords than any other competitor found` was the sentence
 * the real production run produced before this filter existed.
 */

type CompetitorCandidate = {
  domain: string;
  /** Keywords both the target and this competitor rank for. Renamed from the
   *  brief's "commonKeywords" to match CompetitorRow's real field name.
   *  Domain-mode only -- always null on a serp-sourced row. */
  intersections: number | null;
  /** This competitor's own total ranked keywords. Renamed from the brief's
   *  "ownKeywords" for the same reason -- and made nullable, since
   *  CompetitorRow's DataForSEO-backed count can genuinely be unknown. */
  organicKeywords: number | null;
  /** Seed keywords where this competitor outranks the client. Serp-mode
   *  only -- the domain-overlap endpoint never measures this, so it stays
   *  null on a domain-sourced row (see applyProjectCompetitors.ts /
   *  mapCompetitorItem's own "domain-overlap fallback path... reports this
   *  honestly" comment). */
  beatsYouCount: number | null;
  /**
   * The classifier's call (classifyCompetitorDomain) -- null means "not a
   * recognised platform, treat as a real competitor." Optional (and read via
   * `?? null` below), so every caller/fixture that predates this batch --
   * there was no per-row classification before it -- keeps compiling and
   * keeps behaving exactly as it did before: omitting this field reads the
   * same as "unclassified."
   */
  category?: CompetitorCategory | null;
  /** A user pin always overrides the classifier (decision 4). Optional for
   *  the same backward-compatibility reason as `category`. */
  pinned?: boolean;
};

type CompetitorsVerdictInput = {
  target: string;
  competitors: CompetitorCandidate[];
  /**
   * Which discovery path produced `competitors` -- decides whether this
   * reads `intersections` or `beatsYouCount`. Read from the PAGE
   * (`CompetitorsPage.discoveryMode`), never a per-row `source`: a
   * synthesized pinned row hardcodes `source: "serp"` regardless of which
   * mode actually produced the page it was folded into (see
   * `applyProjectCompetitors.ts`), so a per-row read would misclassify it.
   * Optional and defaulting to "domain" so every caller that predates
   * keyword-seeded discovery -- including every existing test here -- keeps
   * its current behavior unchanged.
   */
  discoveryMode?: DiscoveryMode;
  /**
   * How many seed keywords this run was drawn from
   * (`CompetitorsPage.seedSize`) -- the denominator for "what share of your
   * OWN contested keywords does this rival beat you on," serp mode's
   * analogue of domain mode's "what share of the rival's own footprint
   * overlaps with you." Ignored outside serp mode.
   */
  seedSize?: number;
};

/** At or above this share, the closest match is a near-direct competitor --
 *  confidently worth chasing, not just the biggest number in a short list.
 *  Used both as "share of the rival's own footprint" (domain mode) and
 *  "share of the client's own seed keywords" (serp mode); the two shares
 *  measure different things, but the same threshold -- half -- is the same
 *  honest bar for "this is clearly a real rival" in both. */
const STRONG_OVERLAP_SHARE = 0.5;

/** Below this many shared (domain mode) or beaten (serp mode) keywords, even
 *  the "best" match in the list is too small a signal to call a real
 *  rivalry -- five is the point a shared handful of keywords stops looking
 *  like coincidence. */
const WEAK_OVERLAP_COUNT = 5;

/**
 * The Keyword Gap handoff, as a search UPDATER rather than a plain object.
 *
 * Every action that uses this renders on the Competitors page and navigates to
 * another of its own tabs, where `target` is URL state. `functionalUpdate`
 * (@tanstack/router-core) replaces the entire search when handed an object and
 * merges only when handed a function -- so `search: { tab: "gap", competitor }`
 * filled in the rival while dropping the user's own domain, and
 * `useKeywordGapQuery` (`enabled: ... && target !== "" && competitor !== ""`)
 * then never ran.
 *
 * `page` is reset for the same reason the page's own Compare-competitor row
 * action resets it (`CompetitorsPage.onCompareCompetitor`): the gap tab is a
 * different data set, so a page number carried over from the competitor list
 * would put the first metered gap call on a page nobody asked for.
 */
function keywordGapSearch(competitor: string) {
  return (previous: Record<string, unknown>) => ({
    ...previous,
    tab: "gap" as const,
    competitor,
    page: 1,
  });
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function buildDomainModeVerdict(
  input: CompetitorsVerdictInput,
  real: CompetitorCandidate[],
): Verdict {
  const rated = real.filter(
    (candidate): candidate is CompetitorCandidate & { intersections: number } =>
      candidate.intersections != null,
  );
  if (rated.length === 0) {
    return unknownVerdict(
      `None of the ${real.length} competitors found for ${input.target} have a known shared-keyword count, so there is no basis to say which one to chase.`,
    );
  }

  const top = rated.reduce((best, candidate) =>
    candidate.intersections > best.intersections ? candidate : best,
  );
  // Destructured into locals (rather than read off `top` at each use) so
  // the `organicKeywords != null` guard below narrows a plain variable --
  // no unsafe cast needed to use it as a number afterward.
  const { domain, intersections, organicKeywords } = top;

  if (organicKeywords != null && organicKeywords > 0) {
    const share = intersections / organicKeywords;
    if (share >= STRONG_OVERLAP_SHARE) {
      const pct = Math.round(share * 100);
      return {
        read: `${domain} is your closest organic rival, sharing ${formatCount(intersections)} keywords -- ${pct}% of its own ${formatCount(organicKeywords)} ranked keywords overlap with yours.`,
        tone: "good",
        actions: [
          {
            label: `Compare keywords with ${domain} in the Keyword Gap tab`,
            to: {
              to: "/p/$projectId/competitors",
              // The gap tab this label names, already pointed at this rival --
              // `competitor` and `tab` are both in `competitorsSearchSchema`.
              search: keywordGapSearch(domain),
            },
            evidence: `${formatCount(intersections)} shared keywords, ${pct}% of ${domain}'s own ${formatCount(organicKeywords)}`,
            weight: 100,
          },
        ],
      };
    }
  }

  if (intersections >= WEAK_OVERLAP_COUNT) {
    const shareClause =
      organicKeywords != null
        ? `, a modest slice of its own ${formatCount(organicKeywords)} ranked keywords`
        : "";
    return {
      read: `${domain} shares the most keywords with you among the competitors found (${formatCount(intersections)})${shareClause}.`,
      tone: "mixed",
      actions: [
        {
          label: `Compare keywords with ${domain} in the Keyword Gap tab`,
          to: {
            to: "/p/$projectId/competitors",
            // The gap tab this label names, already pointed at this rival --
            // `competitor` and `tab` are both in `competitorsSearchSchema`.
            search: keywordGapSearch(domain),
          },
          evidence: `${formatCount(intersections)} shared keywords`,
          weight: 80,
        },
      ],
    };
  }

  return {
    read: `The closest match among the competitors found, ${domain}, shares only ${formatCount(intersections)} keyword${intersections === 1 ? "" : "s"} with you -- not enough overlap to call it a clear rival to chase.`,
    tone: "bad",
    actions: [
      {
        label:
          "Broaden the competitor search before committing to a chase target",
        evidence: `Best overlap found is only ${formatCount(intersections)} shared keywords`,
        weight: 50,
      },
    ],
  };
}

function buildSerpModeVerdict(
  input: CompetitorsVerdictInput,
  real: CompetitorCandidate[],
): Verdict {
  const rated = real.filter(
    (candidate): candidate is CompetitorCandidate & { beatsYouCount: number } =>
      candidate.beatsYouCount != null,
  );
  if (rated.length === 0) {
    return unknownVerdict(
      `None of the ${real.length} competitors found for ${input.target} show a measured position against your own keywords, so there is no basis to say which one to chase.`,
    );
  }

  const top = rated.reduce((best, candidate) =>
    candidate.beatsYouCount > best.beatsYouCount ? candidate : best,
  );
  const { domain, beatsYouCount } = top;
  const seedSize = input.seedSize ?? 0;

  if (seedSize > 0) {
    const share = beatsYouCount / seedSize;
    if (share >= STRONG_OVERLAP_SHARE) {
      const pct = Math.round(share * 100);
      return {
        read: `${domain} is your closest organic rival, outranking you on ${formatCount(beatsYouCount)} of your ${formatCount(seedSize)} tracked keywords -- ${pct}%.`,
        tone: "good",
        actions: [
          {
            label: `Compare keywords with ${domain} in the Keyword Gap tab`,
            to: {
              to: "/p/$projectId/competitors",
              // The gap tab this label names, already pointed at this rival --
              // `competitor` and `tab` are both in `competitorsSearchSchema`.
              search: keywordGapSearch(domain),
            },
            evidence: `Outranks you on ${formatCount(beatsYouCount)} of your ${formatCount(seedSize)} tracked keywords, ${pct}%`,
            weight: 100,
          },
        ],
      };
    }
  }

  if (beatsYouCount >= WEAK_OVERLAP_COUNT) {
    const shareClause =
      seedSize > 0
        ? `, out of ${formatCount(seedSize)} keywords tracked for this run`
        : "";
    return {
      read: `${domain} outranks you on more of your keywords than any other competitor found (${formatCount(beatsYouCount)})${shareClause}.`,
      tone: "mixed",
      actions: [
        {
          label: `Compare keywords with ${domain} in the Keyword Gap tab`,
          to: {
            to: "/p/$projectId/competitors",
            // The gap tab this label names, already pointed at this rival --
            // `competitor` and `tab` are both in `competitorsSearchSchema`.
            search: keywordGapSearch(domain),
          },
          evidence: `Outranks you on ${formatCount(beatsYouCount)} of your tracked keywords`,
          weight: 80,
        },
      ],
    };
  }

  return {
    read: `The closest match among the competitors found, ${domain}, outranks you on only ${formatCount(beatsYouCount)} of your keywords -- not enough to call it a clear rival to chase.`,
    tone: "bad",
    actions: [
      {
        label:
          "Broaden the competitor search before committing to a chase target",
        evidence: `Best rival found only outranks you on ${formatCount(beatsYouCount)} of your tracked keywords`,
        weight: 50,
      },
    ],
  };
}

export function buildCompetitorsVerdict(
  input: CompetitorsVerdictInput,
): Verdict {
  if (input.competitors.length === 0) {
    return unknownVerdict(
      `No competitor data is available for ${input.target}.`,
    );
  }

  // Decision 6: name the top REAL competitor, never a platform. A pin always
  // wins over the classifier (decision 4) -- isCompetitorRow is the one
  // shared predicate the table UI's grouping reads too, so the headline and
  // the table can never disagree about which rows count.
  const real = input.competitors.filter((candidate) =>
    isCompetitorRow({
      category: candidate.category ?? null,
      pinned: candidate.pinned ?? false,
    }),
  );
  if (real.length === 0) {
    return unknownVerdict(
      `Every domain found for ${input.target} is a platform or aggregator -- social media, video, a marketplace, or similar -- not a genuine competitor, so there is no rival to name.`,
    );
  }

  return input.discoveryMode === "serp"
    ? buildSerpModeVerdict(input, real)
    : buildDomainModeVerdict(input, real);
}
