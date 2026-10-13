import type { BacklinksHistoryItem } from "@/server/lib/dataforseo";
import {
  providerCount,
  providerDate,
  providerHundredScore,
} from "@/shared/provider-observations";

export function mapOverviewHistory(items: BacklinksHistoryItem[]) {
  return items
    .flatMap((item) => {
      const date = providerDate(item.date);
      if (date === null) return [];
      const eventsAvailable = date >= "2021-05-01";
      return [
        {
          date,
          backlinks: providerCount(item.backlinks),
          referringDomains: providerCount(item.referring_domains),
          rank: providerHundredScore(item.rank),
          newBacklinks: eventsAvailable
            ? providerCount(item.new_backlinks)
            : null,
          lostBacklinks: eventsAvailable
            ? providerCount(item.lost_backlinks)
            : null,
          newReferringDomains: eventsAvailable
            ? providerCount(
                item.new_referring_domains ?? item.new_reffering_domains,
              )
            : null,
          lostReferringDomains: eventsAvailable
            ? providerCount(
                item.lost_referring_domains ?? item.lost_reffering_domains,
              )
            : null,
        },
      ];
    })
    .toSorted((a, b) => a.date.localeCompare(b.date));
}
