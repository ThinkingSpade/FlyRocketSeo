import type {
  BulkBacklinksItem,
  BulkNewLostReferringDomainsItem,
  BulkRankItem,
  BulkReferringDomainsItem,
} from "@/server/lib/dataforseo/backlinks-bulk";
import { normalizeComparisonTarget } from "@/shared/backlink-targets";

/**
 * Merges the four `bulk_*` responses (plus bulk spam scores) into one row per
 * target.
 *
 * The endpoints are independent calls that each return their own array, and
 * DataForSEO does not promise those arrays come back in request order. Every
 * item echoes its own `target`, so correlation goes through a normalized form
 * of that field — matching by array position would silently mis-attribute a
 * competitor's numbers to your own domain.
 */

export type ComparisonInputs = {
  /** The analyzed domain, always present in the output and flagged `isYou`. */
  you: string;
  competitors: string[];
  ranks: BulkRankItem[];
  backlinks: BulkBacklinksItem[];
  referringDomains: BulkReferringDomainsItem[];
  newLost: BulkNewLostReferringDomainsItem[];
  spamScores: Array<{ target?: string | null; spam_score?: number | null }>;
};

type ComparisonRow = {
  target: string;
  isYou: boolean;
  rank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  referringDomainsNofollow: number | null;
  spamScore: number | null;
  newReferringDomains: number | null;
  lostReferringDomains: number | null;
  /** Referring domains won minus lost since the comparison's start date. */
  netReferringDomains: number | null;
};

type ComparisonResult = {
  /** Leaderboard order: most referring domains first. */
  rows: ComparisonRow[];
  /** Your 1-based place on referring domains, or null if you have no count. */
  yourPosition: number | null;
  totalTargets: number;
  /** Referring domains separating you from the top row, 0 when you lead. */
  gapToLeader: number | null;
  leader: string | null;
};

function indexByTarget<T extends { target?: string | null }>(
  items: T[],
): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of items) {
    const key = normalizeComparisonTarget(item.target);
    // First write wins: a duplicate target in the response should not let a
    // later, emptier item overwrite a populated one.
    if (key !== "" && !index.has(key)) index.set(key, item);
  }
  return index;
}

export function buildComparison(inputs: ComparisonInputs): ComparisonResult {
  const you = normalizeComparisonTarget(inputs.you);
  const ranks = indexByTarget(inputs.ranks);
  const backlinks = indexByTarget(inputs.backlinks);
  const referringDomains = indexByTarget(inputs.referringDomains);
  const newLost = indexByTarget(inputs.newLost);
  const spamScores = indexByTarget(inputs.spamScores);

  // Deduplicated so a competitor entered as the analyzed domain itself, or
  // twice in different forms, still produces exactly one row.
  const targets = [
    you,
    ...inputs.competitors.map(normalizeComparisonTarget),
  ].filter(
    (target, index, all) => target !== "" && all.indexOf(target) === index,
  );

  const rows = targets
    .map((target): ComparisonRow => {
      const newCount = newLost.get(target)?.new_referring_domains ?? null;
      const lostCount = newLost.get(target)?.lost_referring_domains ?? null;

      return {
        target,
        isYou: target === you,
        rank: ranks.get(target)?.rank ?? null,
        backlinks: backlinks.get(target)?.backlinks ?? null,
        referringDomains:
          referringDomains.get(target)?.referring_domains ?? null,
        referringDomainsNofollow:
          referringDomains.get(target)?.referring_domains_nofollow ?? null,
        spamScore: spamScores.get(target)?.spam_score ?? null,
        newReferringDomains: newCount,
        lostReferringDomains: lostCount,
        netReferringDomains:
          newCount == null && lostCount == null
            ? null
            : (newCount ?? 0) - (lostCount ?? 0),
      };
    })
    // Most referring domains first, so the table reads as a leaderboard.
    // Targets DataForSEO returned nothing for sort last rather than as zero.
    .toSorted(
      (a, b) =>
        (b.referringDomains ?? -1) - (a.referringDomains ?? -1) ||
        a.target.localeCompare(b.target),
    );

  const ranked = rows.filter((row) => row.referringDomains != null);
  const yourRow = rows.find((row) => row.isYou);
  const leaderRow = ranked[0] ?? null;
  const yourPosition =
    yourRow && yourRow.referringDomains != null
      ? ranked.indexOf(yourRow) + 1
      : null;

  return {
    rows,
    yourPosition,
    totalTargets: ranked.length,
    leader: leaderRow?.target ?? null,
    gapToLeader:
      leaderRow?.referringDomains != null && yourRow?.referringDomains != null
        ? leaderRow.referringDomains - yourRow.referringDomains
        : null,
  };
}
