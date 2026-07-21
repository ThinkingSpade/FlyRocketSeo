// Pure content-group classification and period comparison (no I/O), split
// out so the URL rules and delta math are unit-testable.

type PageMetrics = {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type ContentGroupKey =
  | "homepage"
  | "blog"
  | "category"
  | "product"
  | "events"
  | "about"
  | "guides"
  | "other";

const GROUP_LABELS: Record<ContentGroupKey, string> = {
  homepage: "Homepage",
  blog: "Blog Posts",
  category: "Category Pages",
  product: "Product & Services",
  events: "Events & Promotions",
  about: "About & Info Pages",
  guides: "Tutorials & Guides",
  other: "Other Pages",
};

// Ordered rules: the first match wins, so specific patterns precede broad
// ones (a /blog/how-to-… is a guide only when it isn't already a blog post).
const GROUP_RULES: Array<{ key: ContentGroupKey; test: RegExp }> = [
  { key: "blog", test: /\/(blog|news|article|post)s?(\/|$)/ },
  {
    key: "guides",
    test: /\/(guide|tutorial|how-to|learn|docs|resource)s?(\/|$)/,
  },
  {
    key: "category",
    test: /\/(category|categories|collection|shop|catalog)s?(\/|$)/,
  },
  {
    key: "product",
    test: /\/(product|service|solution|pricing|plan|item)s?(\/|$)/,
  },
  { key: "events", test: /\/(event|promo|promotion|offer|deal|sale)s?(\/|$)/ },
  {
    // Allows the common hyphenated forms too: /about-us, /contact-us.
    key: "about",
    test: /\/(about|contact|team|faq|support|privacy|terms|legal|careers?)(-[a-z]+)?(\/|$)/,
  },
];

/** Bucket a URL into a reporting group from its path shape. */
export function classifyContentGroup(url: string): ContentGroupKey {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  if (path === "" || path === "/") return "homepage";

  const match = GROUP_RULES.find((rule) => rule.test.test(path));
  return match?.key ?? "other";
}

export type ContentGroupRow = {
  key: ContentGroupKey;
  label: string;
  clicks: number;
  impressions: number;
  /** Percent change vs the comparison period; null when it had none. */
  clicksDelta: number | null;
  impressionsDelta: number | null;
  pageCount: number;
};

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function sumByGroup(pages: PageMetrics[]) {
  const totals = new Map<
    ContentGroupKey,
    { clicks: number; impressions: number; pages: Set<string> }
  >();
  for (const page of pages) {
    const key = classifyContentGroup(page.page);
    const entry = totals.get(key) ?? {
      clicks: 0,
      impressions: 0,
      pages: new Set<string>(),
    };
    entry.clicks += page.clicks;
    entry.impressions += page.impressions;
    entry.pages.add(page.page);
    totals.set(key, entry);
  }
  return totals;
}

/**
 * Group current-period pages and compare each group with the same group in
 * the previous period. Groups with no traffic in either period are omitted.
 */
export function buildContentGroups(
  current: PageMetrics[],
  previous: PageMetrics[],
): ContentGroupRow[] {
  const currentTotals = sumByGroup(current);
  const previousTotals = sumByGroup(previous);

  const keys = new Set<ContentGroupKey>([
    ...currentTotals.keys(),
    ...previousTotals.keys(),
  ]);

  return [...keys]
    .map((key) => {
      const now = currentTotals.get(key);
      const before = previousTotals.get(key);
      return {
        key,
        label: GROUP_LABELS[key],
        clicks: now?.clicks ?? 0,
        impressions: now?.impressions ?? 0,
        clicksDelta: percentChange(now?.clicks ?? 0, before?.clicks ?? 0),
        impressionsDelta: percentChange(
          now?.impressions ?? 0,
          before?.impressions ?? 0,
        ),
        pageCount: now?.pages.size ?? 0,
      };
    })
    .filter((row) => row.clicks > 0 || row.impressions > 0)
    .toSorted((a, b) => b.impressions - a.impressions);
}

type PageBuckets = {
  top3: number;
  top4to10: number;
  top11to25: number;
  top26to100: number;
};

/** Count pages by their best position band — the Rank Analyzer headline. */
export function buildPageBuckets(pages: PageMetrics[]): PageBuckets {
  const buckets: PageBuckets = {
    top3: 0,
    top4to10: 0,
    top11to25: 0,
    top26to100: 0,
  };
  for (const page of pages) {
    const position = page.position;
    if (position <= 3) buckets.top3 += 1;
    else if (position <= 10) buckets.top4to10 += 1;
    else if (position <= 25) buckets.top11to25 += 1;
    else if (position <= 100) buckets.top26to100 += 1;
  }
  return buckets;
}

type PageMover = {
  page: string;
  clicks: number;
  impressions: number;
  /** Clicks gained against the previous period; always positive here. */
  clicksDelta: number;
};

/**
 * Pages that gained the most clicks against the previous period. Pages absent
 * last period count their whole click total as the gain, which is what "this
 * page started working" should look like in a client report.
 */
export function buildTopMovers(
  current: PageMetrics[],
  previous: PageMetrics[],
  limit = 10,
): PageMover[] {
  const before = new Map(previous.map((page) => [page.page, page.clicks]));

  return current
    .map((page) => ({
      page: page.page,
      clicks: page.clicks,
      impressions: page.impressions,
      clicksDelta: page.clicks - (before.get(page.page) ?? 0),
    }))
    .filter((page) => page.clicksDelta > 0)
    .toSorted((a, b) => b.clicksDelta - a.clicksDelta)
    .slice(0, limit);
}

/** Percent change per bucket, for the headline tiles' delta chips. */
export function bucketDeltas(
  current: PageBuckets,
  previous: PageBuckets,
): Record<keyof PageBuckets, number | null> {
  return {
    top3: percentChange(current.top3, previous.top3),
    top4to10: percentChange(current.top4to10, previous.top4to10),
    top11to25: percentChange(current.top11to25, previous.top11to25),
    top26to100: percentChange(current.top26to100, previous.top26to100),
  };
}
