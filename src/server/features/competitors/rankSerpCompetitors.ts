import type { CompetitorRow } from "@/types/schemas/competitors";
import type { SeedQuery } from "./competitorSeed";

/**
 * The slice of a `serp_competitors` item this ranking reads.
 *
 * Declared structurally rather than importing the SDK item type so the tests
 * can build fixtures by hand -- and so a vendored-typing change cannot quietly
 * alter what this function is asserted to do.
 */
export type RankableItem = {
  domain?: string;
  avg_position?: number;
  median_position?: number;
  etv?: number;
  keywords_count?: number;
  /** keyword -> that domain's rank(s) for it. */
  keywords_positions?: Record<string, number[]>;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Best (lowest) rank a domain holds for one keyword, or null if absent. */
function bestPosition(positions: number[] | undefined): number | null {
  if (!positions || positions.length === 0) return null;
  return Math.min(...positions);
}

/**
 * Ranks discovery candidates by whether they actually beat the client.
 *
 * `beatsYouCount` is the headline: the number of SEED keywords where the
 * candidate outranks the client's own GSC position. It is what demotes a
 * marketplace that ranks for everything at position 30 -- no relevance
 * classifier required, which matters because this deployment has no LLM key.
 *
 * `coverage`'s denominator is the SEED, not the candidate's total keyword
 * count. The old tab divided by the candidate's own footprint, which is why
 * every row read "1% keyword overlap" and carried no information.
 */
export function rankSerpCompetitors(
  items: RankableItem[],
  seed: SeedQuery[],
  selfDomain: string,
): CompetitorRow[] {
  const self = selfDomain.toLowerCase();

  const rows = items.flatMap((item): CompetitorRow[] => {
    const domain = item.domain?.toLowerCase();
    if (!domain || domain === self) return [];

    const theirPositions: number[] = [];
    const clientPositions: number[] = [];
    let beatsYouCount = 0;
    let matched = 0;

    for (const entry of seed) {
      const theirs = bestPosition(item.keywords_positions?.[entry.keyword]);
      if (theirs == null) continue;
      matched += 1;
      theirPositions.push(theirs);
      clientPositions.push(entry.selfPosition);
      if (theirs < entry.selfPosition) beatsYouCount += 1;
    }

    const theirMedian = median(theirPositions);
    const clientMedian = median(clientPositions);

    return [
      {
        domain,
        avgPosition: item.avg_position ?? null,
        // Only meaningful for the domain-overlap endpoint; this path has none
        // and says so rather than inventing a number.
        intersections: null,
        organicKeywords: item.keywords_count ?? null,
        organicTraffic: item.etv ?? null,
        coverage: seed.length > 0 ? matched / seed.length : null,
        beatsYouCount,
        positionDelta:
          theirMedian != null && clientMedian != null
            ? theirMedian - clientMedian
            : null,
        source: "serp",
        pinned: false,
      },
    ];
  });

  return rows.sort((a, b) => {
    const beats = (b.beatsYouCount ?? 0) - (a.beatsYouCount ?? 0);
    if (beats !== 0) return beats;
    return (b.coverage ?? 0) - (a.coverage ?? 0);
  });
}
