/**
 * Referring-domain quality distribution, derived from the Referring Domains
 * sub-tab rows already on the page.
 *
 * A raw referring-domain count says nothing about whether those domains carry
 * any weight. Bucketing them by domain authority turns one number into the shape
 * Ahrefs shows: how much of the profile is real authority and how much is
 * long-tail filler.
 */

type DomainQualityRow = {
  rank: number | null;
  spamScore?: number | null;
};

type QualityBucket = {
  label: string;
  min: number;
  max: number;
  domains: number;
  share: number;
};

type DomainQuality = {
  buckets: QualityBucket[];
  /** Domains counted — rows without a rank are excluded. */
  ranked: number;
  /** Rank at the middle of the distribution. */
  medianRank: number;
  /** Domains at authority 30+, the rough floor for a link that moves anything. */
  strongDomains: number;
  strongShare: number;
  note: string;
};

/**
 * Buckets follow the one-hundred rank scale the backlinks calls already request
 * (`rank_scale: "one_hundred"`), so they line up with the domain-authority
 * numbers shown in the tables.
 */
const BUCKETS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: "0-10", min: 0, max: 10 },
  { label: "11-20", min: 11, max: 20 },
  { label: "21-30", min: 21, max: 30 },
  { label: "31-40", min: 31, max: 40 },
  { label: "41-50", min: 41, max: 50 },
  { label: "51-60", min: 51, max: 60 },
  { label: "61-70", min: 61, max: 70 },
  { label: "71+", min: 71, max: Infinity },
];

/** Inclusive, so the "domain authority 30+" label means what it says. */
const STRONG_RANK_FLOOR = 30;

export function computeDomainQuality(
  rows: DomainQualityRow[],
): DomainQuality | null {
  const ranks = rows
    .map((row) => row.rank)
    .filter((rank): rank is number => rank != null && Number.isFinite(rank));

  if (ranks.length === 0) return null;

  const counts = BUCKETS.map(
    (bucket) =>
      ranks.filter((rank) => rank >= bucket.min && rank <= bucket.max).length,
  );
  const ranked = ranks.length;
  const strongDomains = ranks.filter(
    (rank) => rank >= STRONG_RANK_FLOOR,
  ).length;
  const strongShare = strongDomains / ranked;

  return {
    ranked,
    medianRank: median(ranks),
    strongDomains,
    strongShare,
    buckets: BUCKETS.map((bucket, index) => ({
      ...bucket,
      domains: counts[index],
      share: counts[index] / ranked,
    })),
    note: describeQuality(strongShare, strongDomains),
  };
}

/** Zero-count buckets are absence of data, not a visible sliver of a chart. */
export function filterPositiveQualityBuckets<T extends { domains: number }>(
  buckets: readonly T[],
): T[] {
  return buckets.filter((bucket) => bucket.domains > 0);
}

/**
 * Every sentence here is about the rows ON THIS PAGE, because that is all the
 * input is — one page of referring domains, not the profile.
 *
 * Two branches used to widen to the whole profile ("this profile is built almost
 * entirely from low-authority sites", "an unusually strong profile"). With
 * totalCount at 1,000 and 100 rows visible, the unseen 900 can invert either
 * verdict, so the page cannot speak for the profile.
 */
/**
 * Reports the observed domain-authority distribution and stops there.
 *
 * Two things it deliberately no longer claims:
 *
 * - **How much weight the links pass.** Domain authority describes the referring domain's own
 *   backlink profile, not the placement, follow status or outbound-link dilution
 *   of the specific link pointing here. A domain at 29 can send a followed
 *   editorial link from a page with few outbound links; "passes little weight"
 *   is not derivable from domain authority.
 * - **Whether the mix is normal or unusual.** That needs a comparison set for
 *   this niche, which we do not have.
 */
function describeQuality(strongShare: number, strongDomains: number): string {
  const percent = Math.round(strongShare * 100);
  if (strongDomains === 0) {
    return "None of the referring domains on this page reach domain authority 30.";
  }
  if (strongShare < 0.15) {
    return `${percent}% of the referring domains on this page reach domain authority 30; the rest sit below it.`;
  }
  if (strongShare < 0.4) {
    return `${percent}% of the referring domains on this page reach domain authority 30, the rest below.`;
  }
  return `${percent}% of the referring domains on this page reach domain authority 30.`;
}

function median(values: number[]): number {
  const sorted = [...values].toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}
