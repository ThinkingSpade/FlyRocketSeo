/**
 * A small, internally consistent backlink profile for local development.
 *
 * The shape is modelled on the real profile that drove the Backlinks work
 * (30 links across 29 domains), including the degenerate cases that made the
 * page look broken and that the UI now handles explicitly:
 *
 *  - most links carry a BLANK country code, so the countries card must say the
 *    value was not provided instead of drawing a nameless bar
 *  - "Placement on page" and "Link types" each have a single value, which must
 *    read as a sentence rather than a 100%-wide bar
 *  - Domain Rank is zero across the whole year, so the authority chart must be
 *    replaced by a sentence rather than plotted flat
 *  - one referring domain scores exactly 0 for spam (must render `0`, not blank)
 *    and one scores 72 (the High-risk tier)
 */

export type SeedLink = {
  domainFrom: string;
  urlFrom: string;
  urlTo: string;
  anchor: string;
  itemType: string;
  isDofollow: boolean;
  relAttributes: string[];
  rank: number;
  domainFromRank: number;
  pageFromRank: number;
  spamScore: number;
  firstSeen: string;
  lastSeen: string;
  isLost: boolean;
  isBroken: boolean;
  linksCount: number;
  /** Drill-down dimensions. `country` is deliberately blank for most rows. */
  country: string;
  tld: string;
  platformType: string;
  semanticLocation: string;
};

const TARGET_PAGES = ["/", "/products", "/vending-services", "/contact"];

/** Two links share one domain, so one-per-domain returns 29 and as_is returns 30. */
export function buildSeedLinks(target: string): SeedLink[] {
  const links: SeedLink[] = [];
  for (let index = 0; index < 30; index += 1) {
    // Domain 7 appears twice; every other index gets its own domain.
    const domainIndex = index === 8 ? 7 : index;
    const tld = pickTld(domainIndex);
    const domainFrom = `source-${String(domainIndex).padStart(2, "0")}.${tld}`;
    const platformType = pickPlatformType(domainIndex);
    links.push({
      domainFrom,
      urlFrom: `https://${domainFrom}/post/${index + 1}`,
      urlTo: `https://${target}${TARGET_PAGES[index % TARGET_PAGES.length]}`,
      anchor: pickAnchor(index, target),
      // Single-valued on purpose: the Link types card must not draw a bar.
      itemType: "anchor",
      isDofollow: index % 5 !== 0,
      relAttributes:
        index % 5 === 0 ? ["nofollow"] : index % 7 === 0 ? ["noopener"] : [],
      rank: 0,
      domainFromRank: 0,
      pageFromRank: 0,
      spamScore: pickSpamScore(index),
      firstSeen: `2026-0${(index % 8) + 1}-1${index % 9}T00:00:00Z`,
      lastSeen: "2026-08-01T00:00:00Z",
      isLost: false,
      isBroken: false,
      linksCount: 1,
      // Blank for all but two rows -- this is the case that produced a
      // nameless bar carrying 28 of 30 links.
      country: index === 3 ? "IN" : index === 11 ? "CV" : "",
      tld,
      platformType,
      // Single-valued on purpose, and not a real semantic placement: the card
      // must say placement was not classified.
      semanticLocation: "anchor",
    });
  }
  return links;
}

function pickTld(index: number): string {
  if (index < 7) return "com";
  if (index < 10) return "info";
  if (index < 13) return "pages.dev";
  if (index < 16) return "pro";
  if (index < 18) return "eu";
  return "com";
}

function pickPlatformType(index: number): string {
  if (index % 3 === 0) return "unknown";
  if (index % 3 === 1) return "blogs";
  return "cms";
}

function pickAnchor(index: number, target: string): string {
  const brand = target.split(".")[0] ?? "brand";
  if (index % 4 === 0) return brand;
  if (index % 4 === 1) return `${brand} reviews`;
  if (index % 4 === 2) return "click here";
  return "vending machine supplier";
}

/** Includes an exact 0 and a 72 so both ends of the spam model are visible. */
function pickSpamScore(index: number): number {
  if (index === 0) return 0;
  if (index === 5) return 72;
  if (index === 17) return 61;
  return (index * 7) % 45;
}

export type SeedBreakdownRow = { label: string; value: number };

/** Ranked label/count splits, matching how the summary endpoint reports them. */
export function buildBreakdowns(links: SeedLink[]) {
  return {
    referringCountries: tally(links, (link) => link.country),
    referringTlds: tally(links, (link) => link.tld),
    referringLinkTypes: tally(links, (link) => link.itemType),
    referringLinkAttributes: tally(links, (link) =>
      link.relAttributes.length > 0 ? link.relAttributes[0] : null,
    ),
    referringPlatformTypes: tally(links, (link) => link.platformType),
    referringPlacements: tally(links, (link) => link.semanticLocation),
  };
}

/**
 * Counts by label, largest first. A blank label is kept, not dropped: the whole
 * point of this fixture is that the UI meets one.
 */
function tally(
  links: SeedLink[],
  pick: (link: SeedLink) => string | null,
): SeedBreakdownRow[] {
  const counts = new Map<string, number>();
  for (const link of links) {
    const label = pick(link);
    if (label === null) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 5);
}

/** Twelve monthly points with Domain Rank flat at zero all year. */
export function buildTrends() {
  const trends = [];
  const newLostTrends = [];
  for (let month = 0; month < 12; month += 1) {
    const date = `2025-${String(month + 1).padStart(2, "0")}-01`;
    trends.push({
      date,
      rank: 0,
      backlinks: 20 + month,
      referringDomains: 19 + month,
    });
    newLostTrends.push({
      date,
      newBacklinks: month % 3,
      lostBacklinks: month % 2,
      newReferringDomains: month % 3,
      lostReferringDomains: month % 2,
    });
  }
  return { trends, newLostTrends };
}
