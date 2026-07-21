import type { BacklinksHistoryItem } from "@/server/lib/dataforseo/backlinks";

// Pure mapping for the backlinks history timeline (no I/O), split out so the
// field fallbacks are unit-testable.

export type BacklinksTimelinePoint = {
  /** ISO date (first day of the period DataForSEO reports). */
  date: string;
  referringDomains: number | null;
  newReferringDomains: number;
  lostReferringDomains: number;
  newBacklinks: number;
  lostBacklinks: number;
};

/**
 * Normalize history rows into chart points, oldest first. DataForSEO has
 * shipped both `new_referring_domains` and the misspelled
 * `new_reffering_domains` — read whichever is present.
 */
export function mapBacklinksTimeline(
  items: BacklinksHistoryItem[],
): BacklinksTimelinePoint[] {
  return items
    .map((item) => {
      const date = item.date?.slice(0, 10);
      if (!date) return null;
      return {
        date,
        referringDomains: item.referring_domains ?? null,
        newReferringDomains:
          item.new_referring_domains ?? item.new_reffering_domains ?? 0,
        lostReferringDomains:
          item.lost_referring_domains ?? item.lost_reffering_domains ?? 0,
        newBacklinks: item.new_backlinks ?? 0,
        lostBacklinks: item.lost_backlinks ?? 0,
      };
    })
    .filter((point): point is BacklinksTimelinePoint => point != null)
    .toSorted((a, b) => a.date.localeCompare(b.date));
}
