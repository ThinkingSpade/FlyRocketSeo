/**
 * Whether this client can realistically rank for this keyword.
 *
 * Deliberately built on the ONE authority signal this app can read for free
 * and keylessly: Ahrefs' public domain-rating lookup, which SERP Overview
 * already uses. No metered call is needed to answer the question a user
 * actually asks first, which is why the verdict renders immediately rather
 * than behind a button.
 *
 * The measure is "how many of the current top ten are no stronger than you",
 * not "what is the average DR". An average is dragged upward by one Wikipedia
 * or Amazon result and would call a perfectly winnable local SERP hopeless;
 * what decides whether there is room is how many BEATABLE pages already sit on
 * page one, because those are the positions actually available.
 */

type RankingVerdict = "winnable" | "stretch" | "unlikely" | "unknown";

type RankingAssessment = {
  verdict: RankingVerdict;
  /** Top-ten domains no stronger than the client's own. */
  reachableCount: number;
  /** How many of the top ten had a DR we could read at all. */
  ratedCount: number;
  reason: string;
};

/**
 * Domains within this many DR points ABOVE the client's own still count as
 * reachable. DR is a log-scaled estimate, not a measurement, and treating a
 * DR 28 competitor as unbeatable by a DR 26 site would be false precision.
 */
const DR_TOLERANCE = 5;

/** At or above this many reachable top-ten results, there is real room. */
const WINNABLE_REACHABLE = 3;

export function assessRanking(input: {
  ownDomainRating: number | null;
  /** Top-ten competitor DRs in rank order; null where unknown. */
  competitorRatings: ReadonlyArray<number | null>;
}): RankingAssessment {
  const rated = input.competitorRatings.filter(
    (rating): rating is number => rating !== null,
  );

  // Two genuinely different unknowns, deliberately given the same verdict and
  // different reasons: we don't know the client's own strength, or we couldn't
  // read the SERP's. Guessing either way would be worse than saying so.
  if (input.ownDomainRating === null) {
    return {
      verdict: "unknown",
      reachableCount: 0,
      ratedCount: rated.length,
      reason:
        "We don't have a domain rating for this project yet, so there's nothing to compare the SERP against.",
    };
  }
  if (rated.length === 0) {
    return {
      verdict: "unknown",
      reachableCount: 0,
      ratedCount: 0,
      reason:
        "We couldn't read a domain rating for any of the pages currently ranking.",
    };
  }

  const own = input.ownDomainRating;
  const reachableCount = rated.filter(
    (rating) => rating <= own + DR_TOLERANCE,
  ).length;

  if (reachableCount >= WINNABLE_REACHABLE) {
    return {
      verdict: "winnable",
      reachableCount,
      ratedCount: rated.length,
      reason: `${reachableCount} of the ${rated.length} ranking pages we could rate sit at or near your DR ${own}. There is room on this page for a better answer.`,
    };
  }
  if (reachableCount > 0) {
    return {
      verdict: "stretch",
      reachableCount,
      ratedCount: rated.length,
      reason: `Only ${reachableCount} of the ${rated.length} ranking pages we could rate is within reach of your DR ${own}. Winnable, but it will take a genuinely better page and some links.`,
    };
  }
  return {
    verdict: "unlikely",
    reachableCount: 0,
    ratedCount: rated.length,
    reason: `Every page we could rate outranks your DR ${own} by more than ${DR_TOLERANCE}. Chase a longer-tail version of this keyword first and come back to this one with more authority.`,
  };
}

const VERDICT_LABELS: Record<RankingVerdict, string> = {
  winnable: "Winnable",
  stretch: "A stretch",
  unlikely: "Not yet",
  unknown: "Can't tell",
};

export function rankingVerdictLabel(verdict: RankingVerdict): string {
  return VERDICT_LABELS[verdict];
}
