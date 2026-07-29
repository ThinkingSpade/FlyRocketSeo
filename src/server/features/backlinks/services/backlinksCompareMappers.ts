import type { BacklinksIntersectionItem } from "@/server/lib/dataforseo/backlinks-insights";
import type { ReferringNetworkItem } from "@/server/lib/dataforseo/backlinks-bulk";
import type {
  LinkIntersectRow,
  ReferringNetworkRow,
} from "@/types/schemas/backlinks-compare";
import { normalizeComparisonTarget } from "@/shared/backlink-targets";

/**
 * Shapes the two nested DataForSEO payloads that the compare service reads.
 * Both are pure so the awkward parts — a response keyed by request index, and
 * a concentration ratio — are tested without touching the network.
 */

/** Anything above this share of referring domains in three subnets is odd. */
const NETWORK_CONCENTRATION_SAMPLE = 3;

/**
 * `domain_intersection` comes back keyed by the same `"1"`, `"2"`, … indices
 * the request used, so key `n` maps to `competitors[n - 1]`. Every value under
 * those keys describes the *same* referring domain — its `target` field — from
 * the point of view of one competitor.
 *
 * A key is only present when that domain actually links to that competitor,
 * which is what makes the key count the "links to N of your competitors"
 * number.
 */
export function mapIntersectionRows(
  items: BacklinksIntersectionItem[],
  competitors: string[],
): LinkIntersectRow[] {
  return items.flatMap((item) => {
    const entries = Object.entries(item.domain_intersection ?? {});
    if (entries.length === 0) return [];

    const linkedTo: string[] = [];
    let domain = "";
    let rank: number | null = null;
    let backlinks: number | null = null;
    let spamScore: number | null = null;
    let firstSeen: string | null = null;

    for (const [key, entry] of entries) {
      if (!entry) continue;
      const competitor = competitors[Number(key) - 1];
      if (competitor) linkedTo.push(competitor);

      if (domain === "") domain = normalizeComparisonTarget(entry.target);
      // Identical across entries in practice, but take the strongest reading
      // rather than assuming which key arrives first.
      if (entry.rank != null) rank = Math.max(rank ?? entry.rank, entry.rank);
      if (entry.backlinks != null) {
        backlinks = (backlinks ?? 0) + entry.backlinks;
      }
      if (entry.backlinks_spam_score != null) {
        spamScore = Math.max(
          spamScore ?? entry.backlinks_spam_score,
          entry.backlinks_spam_score,
        );
      }
      if (entry.first_seen && (!firstSeen || entry.first_seen < firstSeen)) {
        firstSeen = entry.first_seen;
      }
    }

    if (domain === "") return [];

    return [
      {
        domain,
        competitorsLinked: linkedTo.length,
        linkedTo,
        rank,
        backlinks,
        spamScore,
        firstSeen,
      },
    ];
  });
}

/**
 * Groups referring links by subnet and measures how concentrated they are. A
 * profile whose links cluster into a handful of networks is the footprint a
 * link farm leaves behind, and no per-domain view shows it.
 *
 * `totalCount` is the number of networks DataForSEO holds, which is usually
 * larger than the page of `items` we asked for. The concentration ratio is
 * therefore computed over a truncated sample and is only trustworthy when the
 * page covers everything — `isComplete` records that, and the UI must not call
 * a profile concentrated on the strength of a truncated one. Taking the top N
 * networks and dividing by their own total would otherwise report a high share
 * for every large, perfectly healthy profile.
 */
export function summarizeNetworks(
  items: ReferringNetworkItem[],
  totalCount: number | null,
): {
  rows: ReferringNetworkRow[];
  totalDomains: number;
  topThreeShare: number;
  isComplete: boolean;
} {
  const rows = items
    .flatMap((item) => {
      const networkAddress = item.network_address?.trim() ?? "";
      if (networkAddress === "") return [];
      return [
        {
          networkAddress,
          referringDomains: item.referring_domains ?? null,
          backlinks: item.backlinks ?? null,
          rank: item.rank ?? null,
        },
      ];
    })
    .toSorted(
      (a, b) =>
        (b.referringDomains ?? 0) - (a.referringDomains ?? 0) ||
        a.networkAddress.localeCompare(b.networkAddress),
    );

  const totalDomains = rows.reduce(
    (total, row) => total + (row.referringDomains ?? 0),
    0,
  );
  const topThree = rows
    .slice(0, NETWORK_CONCENTRATION_SAMPLE)
    .reduce((total, row) => total + (row.referringDomains ?? 0), 0);

  return {
    rows,
    totalDomains,
    topThreeShare: totalDomains > 0 ? topThree / totalDomains : 0,
    isComplete: totalCount == null || totalCount <= rows.length,
  };
}
