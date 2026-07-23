import type { BacklinksTopPagesData } from "./backlinksPageTypes";

type TopPageRow = BacklinksTopPagesData["rows"][number];

/**
 * Broken-link reclamation: pages on this site that still receive backlinks but
 * are broken, ranked by how many links are at stake.
 *
 * This is the highest-value, lowest-effort link work there is — the links are
 * already earned, they just point at a dead URL. Redirecting the page recovers
 * them without any outreach.
 *
 * Read entirely from the Top Pages rows the tab already fetched, so surfacing
 * it costs nothing extra.
 */

export type ReclaimTarget = {
  page: string;
  /** Broken backlinks pointing at this page — the links being wasted. */
  brokenBacklinks: number;
  /** All backlinks to the page, for context on how much is at risk. */
  totalBacklinks: number | null;
  referringDomains: number | null;
};

export function findReclaimTargets(
  rows: readonly TopPageRow[],
  limit: number,
): ReclaimTarget[] {
  return rows
    .flatMap((row) => {
      const broken = row.brokenBacklinks ?? 0;
      if (!row.page || broken <= 0) return [];
      return [
        {
          page: row.page,
          brokenBacklinks: broken,
          totalBacklinks: row.backlinks,
          referringDomains: row.referringDomains,
        },
      ];
    })
    .toSorted(
      (a, b) =>
        b.brokenBacklinks - a.brokenBacklinks || a.page.localeCompare(b.page),
    )
    .slice(0, limit);
}

/** Total links recoverable across the surfaced targets. */
export function countLinksAtStake(targets: readonly ReclaimTarget[]): number {
  return targets.reduce((sum, target) => sum + target.brokenBacklinks, 0);
}
