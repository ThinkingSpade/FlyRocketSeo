import type { CompetitorRow } from "@/types/schemas/competitors";
import { normalizeDiscoveredDomain } from "@/server/lib/domainUtils";
import { classifyCompetitorDomain } from "./classifyCompetitorDomain";
import type { SeedQuery } from "./competitorSeed";
import { providerCount } from "@/shared/provider-observations";
import {
  keywordEstimate,
  keywordPosition,
} from "@/shared/keyword-observations";

/**
 * The slice of a `serp_competitors` item this ranking reads.
 *
 * Declared structurally rather than importing the SDK item type so the tests
 * can build fixtures by hand -- and so a vendored-typing change cannot quietly
 * alter what this function is asserted to do.
 */
type RankableItem = {
  domain?: string | null;
  avg_position?: number | null;
  median_position?: number | null;
  etv?: number | null;
  keywords_count?: number | null;
  /** keyword -> that domain's rank(s) for it. */
  keywords_positions?: Record<string, Array<number | null> | null> | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Best (lowest) rank a domain holds for one keyword, or null if absent. */
function bestPosition(
  positions: Array<number | null> | null | undefined,
): number | null {
  if (!positions || positions.length === 0) return null;
  const ranks = positions.map(keywordPosition);
  if (ranks.some((rank) => rank === null)) return null;
  return Math.min(...ranks.filter((rank): rank is number => rank !== null));
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
  // Normalized the same way `ProjectCompetitorRepository` normalizes a saved
  // pin/exclude override (`normalizeDiscoveredDomain`'s own doc comment has
  // the full rationale), so downstream `applyProjectCompetitors` can match a
  // discovered row against an override with plain string equality, and so a
  // client domain DataForSEO echoes back as "www.example.com" still matches
  // `selfDomain` here and gets excluded as the client's own row.
  const self = normalizeDiscoveredDomain(selfDomain);

  const rows = items.flatMap((item): CompetitorRow[] => {
    const domain = item.domain ? normalizeDiscoveredDomain(item.domain) : null;
    if (!domain || domain === self) return [];

    const theirPositions: number[] = [];
    const clientPositions: number[] = [];
    let beatsYouCount = 0;
    let matched = 0;
    let complete =
      item.keywords_positions !== undefined && item.keywords_positions !== null;

    for (const entry of seed) {
      const ranks = item.keywords_positions?.[entry.keyword];
      if (
        ranks === null ||
        ranks?.some((rank) => keywordPosition(rank) === null) ||
        !Number.isFinite(entry.selfPosition) ||
        entry.selfPosition <= 0
      )
        complete = false;
      const theirs = bestPosition(item.keywords_positions?.[entry.keyword]);
      if (theirs == null) continue;
      matched += 1;
      theirPositions.push(theirs);
      clientPositions.push(entry.selfPosition);
      if (theirs < entry.selfPosition) beatsYouCount += 1;
    }

    const declaredCount = providerCount(item.keywords_count);
    if (declaredCount !== null && declaredCount !== matched) complete = false;
    if (
      Object.keys(item.keywords_positions ?? {}).some(
        (keyword) => !seed.some((entry) => entry.keyword === keyword),
      )
    )
      complete = false;
    const theirMedian = median(theirPositions);
    const clientMedian = median(clientPositions);

    return [
      {
        domain,
        avgPosition:
          keywordEstimate(item.avg_position) !== null && item.avg_position! > 0
            ? item.avg_position!
            : null,
        // Only meaningful for the domain-overlap endpoint; this path has none
        // and says so rather than inventing a number.
        intersections: null,
        organicKeywords: providerCount(item.keywords_count),
        organicTraffic: keywordEstimate(item.etv),
        coverage: complete && seed.length > 0 ? matched / seed.length : null,
        beatsYouCount: complete ? beatsYouCount : null,
        positionDelta:
          complete && theirMedian != null && clientMedian != null
            ? theirMedian - clientMedian
            : null,
        source: "serp",
        pinned: false,
        // Advisory only -- does not affect this function's own sort below
        // (decision 3: classification is presentation data, never a
        // server-side filter). See classifyCompetitorDomain's own doc
        // comment for why a domain it doesn't recognise stays null/"real
        // competitor" rather than "unknown".
        category: classifyCompetitorDomain(domain),
      },
    ];
  });

  return rows.toSorted((a, b) => {
    const beats = (b.beatsYouCount ?? 0) - (a.beatsYouCount ?? 0);
    if (beats !== 0) return beats;
    return (b.coverage ?? 0) - (a.coverage ?? 0);
  });
}
