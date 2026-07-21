// Pure second-order cuts of the Page Explorer keyword list (no I/O), split
// out so the bucket math is unit-testable.

export type PageKeyword = {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  traffic: number | null;
};

type PositionBuckets = {
  top3: number;
  pos4to10: number;
  pos11to20: number;
  pos21to50: number;
  pos51plus: number;
};

type PageRealEstate = {
  numberOne: number;
  top3: number;
  top10: number;
  strikingDistance: number;
};

/** Split ranked keywords into the standard position buckets. */
export function computePositionBuckets(
  keywords: PageKeyword[],
): PositionBuckets {
  const buckets: PositionBuckets = {
    top3: 0,
    pos4to10: 0,
    pos11to20: 0,
    pos21to50: 0,
    pos51plus: 0,
  };
  for (const item of keywords) {
    const position = item.position;
    if (position == null) continue;
    if (position <= 3) buckets.top3 += 1;
    else if (position <= 10) buckets.pos4to10 += 1;
    else if (position <= 20) buckets.pos11to20 += 1;
    else if (position <= 50) buckets.pos21to50 += 1;
    else buckets.pos51plus += 1;
  }
  return buckets;
}

/** Headline counts: #1s, top-3s, top-10s, and striking distance (4–15). */
export function computePageRealEstate(keywords: PageKeyword[]): PageRealEstate {
  let numberOne = 0;
  let top3 = 0;
  let top10 = 0;
  let strikingDistance = 0;
  for (const item of keywords) {
    const position = item.position;
    if (position == null) continue;
    if (position === 1) numberOne += 1;
    if (position <= 3) top3 += 1;
    if (position <= 10) top10 += 1;
    if (position >= 4 && position <= 15) strikingDistance += 1;
  }
  return { numberOne, top3, top10, strikingDistance };
}

type TrafficConcentration = {
  rows: Array<{
    keyword: string;
    position: number | null;
    traffic: number;
    /** Share of the page's total estimated traffic, 0..1. */
    share: number;
  }>;
  /** Combined share of the listed rows, 0..1. */
  topShare: number;
};

/** The top keywords by traffic and how much of the page's traffic they carry. */
export function computeTrafficConcentration(
  keywords: PageKeyword[],
  estimatedTraffic: number,
  limit = 5,
): TrafficConcentration | null {
  if (estimatedTraffic <= 0) return null;
  const rows = keywords
    .filter((item) => (item.traffic ?? 0) > 0)
    .toSorted((a, b) => (b.traffic ?? 0) - (a.traffic ?? 0))
    .slice(0, limit)
    .map((item) => ({
      keyword: item.keyword,
      position: item.position,
      traffic: item.traffic ?? 0,
      share: (item.traffic ?? 0) / estimatedTraffic,
    }));
  if (rows.length === 0) return null;
  return {
    rows,
    topShare: Math.min(
      1,
      rows.reduce((sum, row) => sum + row.share, 0),
    ),
  };
}

/** Positions 4–15 by volume — the title/meta/content push candidates. */
export function computeStrikingDistance(
  keywords: PageKeyword[],
  limit = 10,
): PageKeyword[] {
  return keywords
    .filter(
      (item) =>
        item.position != null && item.position >= 4 && item.position <= 15,
    )
    .toSorted((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, limit);
}
