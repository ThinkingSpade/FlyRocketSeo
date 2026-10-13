import type { BacklinksHistoryItem } from "@/server/lib/dataforseo/backlinks";

// Pure mapping for the backlinks history timeline (no I/O), split out so the
// field fallbacks are unit-testable.

type BacklinksTimelinePoint = {
  /** ISO date of the observation DataForSEO reports. */
  date: string;
  referringDomains: number | null;
  newReferringDomains: number | null;
  lostReferringDomains: number | null;
  newBacklinks: number | null;
  lostBacklinks: number | null;
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
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      const parsed = new Date(`${date}T00:00:00Z`);
      if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date
      )
        return null;
      // The provider documents pre-May-2021 event counts as unavailable and
      // returns placeholder zeroes: those cannot establish zero movement.
      // https://docs.dataforseo.com/v3/backlinks/history/live/
      const eventsAvailable = date >= "2021-05-01";
      return {
        date,
        referringDomains: readCount(item.referring_domains),
        newReferringDomains: eventsAvailable
          ? readCount(item.new_referring_domains ?? item.new_reffering_domains)
          : null,
        lostReferringDomains: eventsAvailable
          ? readCount(
              item.lost_referring_domains ?? item.lost_reffering_domains,
            )
          : null,
        newBacklinks: eventsAvailable ? readCount(item.new_backlinks) : null,
        lostBacklinks: eventsAvailable ? readCount(item.lost_backlinks) : null,
      };
    })
    .filter((point): point is BacklinksTimelinePoint => point != null)
    .toSorted((a, b) => a.date.localeCompare(b.date));
}

function readCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
