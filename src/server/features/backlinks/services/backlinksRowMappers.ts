import type {
  BacklinksAnchorItem,
  BacklinksItem,
  DomainPageSummaryItem,
  ReferringDomainItem,
} from "@/server/lib/dataforseo";
import {
  providerCount,
  providerHundredScore,
  providerTimestamp,
} from "@/shared/provider-observations";

/** Row-level shaping of DataForSEO backlink payloads into our camelCase rows.
 *  Split out to keep the service file focused on fetching and caching. */

export function mapBacklinksRows(rows: BacklinksItem[]) {
  return rows.map((item) => ({
    domainFrom: item.domain_from ?? null,
    urlFrom: item.url_from ?? null,
    urlTo: item.url_to ?? null,
    anchor: item.anchor ?? null,
    itemType: item.item_type ?? null,
    isDofollow: item.dofollow ?? null,
    relAttributes: item.rel_attributes ?? item.attributes ?? [],
    rank: providerHundredScore(item.rank),
    domainFromRank: providerHundredScore(item.domain_from_rank),
    pageFromRank: providerHundredScore(item.page_from_rank),
    spamScore: providerHundredScore(
      item.backlink_spam_score ?? item.backlinks_spam_score,
    ),
    firstSeen: providerTimestamp(item.first_seen),
    lastSeen: providerTimestamp(item.lost_date ?? item.last_visited),
    isLost:
      item.is_lost ??
      (providerTimestamp(item.lost_date) !== null ? true : null),
    isBroken: item.is_broken ?? null,
    linksCount: providerCount(item.links_count),
  }));
}

export function mapReferringDomainsRows(rows: ReferringDomainItem[]) {
  return rows.map((item) => ({
    domain: item.domain ?? null,
    backlinks: providerCount(item.backlinks),
    referringPages: providerCount(item.referring_pages),
    rank: providerHundredScore(item.rank),
    spamScore: providerHundredScore(item.backlinks_spam_score),
    firstSeen: providerTimestamp(item.first_seen),
    brokenBacklinks: providerCount(item.broken_backlinks),
    brokenPages: providerCount(item.broken_pages),
  }));
}

export function mapTopPagesRows(rows: DomainPageSummaryItem[]) {
  return rows.map((item) => ({
    page: item.page ?? item.url ?? null,
    backlinks: providerCount(item.backlinks),
    referringDomains: providerCount(item.referring_domains),
    rank: providerHundredScore(item.rank),
    brokenBacklinks: providerCount(item.broken_backlinks),
  }));
}

export function mapAnchorsRows(rows: BacklinksAnchorItem[]) {
  return rows.map((item) => ({
    anchor: item.anchor ?? null,
    backlinks: providerCount(item.backlinks),
    referringDomains: providerCount(item.referring_domains),
    rank: providerHundredScore(item.rank),
    spamScore: providerHundredScore(item.backlinks_spam_score),
    firstSeen: providerTimestamp(item.first_seen),
  }));
}
