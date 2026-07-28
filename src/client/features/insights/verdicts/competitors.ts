import { unknownVerdict, type Verdict } from "../types";

/**
 * Reads a competitor list for the one decision it actually supports: which
 * rival is worth chasing. `CompetitorsService.getCompetitors` already orders
 * its own results by shared-keyword volume ("Rank by shared-keyword volume
 * so obvious rivals surface first") -- this module leans on that same
 * signal, intersections, as the one honest measure of "how much of a rival
 * is this," rather than inventing a new one.
 *
 * This input has no per-keyword data at all (that lives behind a separate,
 * per-competitor metered Keyword Gap call), so unlike the brief's promise of
 * "the first keyword to take," this module can only point at the mechanism
 * that surfaces one -- it cannot name a keyword it was never given.
 */

type CompetitorCandidate = {
  domain: string;
  /** Keywords both the target and this competitor rank for. Renamed from the
   *  brief's "commonKeywords" to match CompetitorRow's real field name. */
  intersections: number | null;
  /** This competitor's own total ranked keywords. Renamed from the brief's
   *  "ownKeywords" for the same reason -- and made nullable, since
   *  CompetitorRow's DataForSEO-backed count can genuinely be unknown. */
  organicKeywords: number | null;
};

type CompetitorsVerdictInput = {
  target: string;
  competitors: CompetitorCandidate[];
};

/** At or above this share of a rival's own ranked keywords overlapping with
 *  yours, it is a near-direct competitor -- confidently worth chasing, not
 *  just the biggest number in a short list. */
const STRONG_OVERLAP_SHARE = 0.5;

/** Below this many shared keywords, even the "best" match in the list is too
 *  small an overlap to call a real rivalry -- five is the point a shared
 *  handful of keywords stops looking like coincidence. */
const WEAK_OVERLAP_COUNT = 5;

function formatCount(value: number): string {
  return value.toLocaleString();
}

export function buildCompetitorsVerdict(
  input: CompetitorsVerdictInput,
): Verdict {
  if (input.competitors.length === 0) {
    return unknownVerdict(
      `No competitor data is available for ${input.target}.`,
    );
  }

  const rated = input.competitors.filter(
    (candidate): candidate is CompetitorCandidate & { intersections: number } =>
      candidate.intersections != null,
  );
  if (rated.length === 0) {
    return unknownVerdict(
      `None of the ${input.competitors.length} competitors found for ${input.target} have a known shared-keyword count, so there is no basis to say which one to chase.`,
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

export function competitorsRowNote(row: {
  intersections: number | null;
  organicKeywords: number | null;
}): string | null {
  if (row.intersections == null || row.organicKeywords == null) return null;
  if (row.organicKeywords <= 0) return null;
  const pct = Math.round((row.intersections / row.organicKeywords) * 100);
  return `${pct}% keyword overlap`;
}
