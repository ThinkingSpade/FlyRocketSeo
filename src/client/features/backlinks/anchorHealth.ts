/**
 * Anchor-text health, derived entirely from the anchors sub-tab rows that are
 * already on the page — no extra DataForSEO call.
 *
 * Two questions get answered: what *kind* of anchors point at the site, and
 * whether any single commercial phrase is concentrated enough to read as
 * manipulation. Google's own guidance treats "keyword-rich anchor text at
 * unnatural scale" as a link-scheme signal, and a natural profile is dominated
 * by brand and URL anchors rather than one repeated phrase.
 *
 * The unit is deliberately *anchor mentions*, not unique referring domains.
 * One domain that links with three different anchors appears on three rows,
 * and the rows carry no domain identity to de-duplicate on — so summing their
 * counts gives domain-anchor pairs. Every share below is a share of mentions,
 * and the copy says so; calling it "of referring domains" would understate a
 * concentrated phrase whenever the rest of the profile uses varied anchors.
 */

type AnchorCategory =
  | "branded"
  | "naked-url"
  | "generic"
  | "empty"
  | "descriptive";

export type AnchorHealthRow = {
  anchor: string | null;
  backlinks: number | null;
  referringDomains: number | null;
};

type AnchorCategoryBreakdown = {
  category: AnchorCategory;
  label: string;
  /** Anchor mentions, i.e. domain-anchor pairs — see the note above. */
  mentions: number;
  share: number;
};

type AnchorConcentration = {
  anchor: string;
  mentions: number;
  share: number;
};

type AnchorHealth = {
  totalMentions: number;
  categories: AnchorCategoryBreakdown[];
  /** Highest-volume anchor that is neither branded, empty, nor a bare URL. */
  topCommercial: AnchorConcentration | null;
  verdict: "healthy" | "watch" | "over-optimized";
  note: string;
};

const CATEGORY_LABELS: Record<AnchorCategory, string> = {
  branded: "Branded",
  "naked-url": "Bare URL",
  generic: "Generic",
  empty: "Empty / image",
  descriptive: "Descriptive",
};

/** Ordered so the breakdown always reads the same way, regardless of volume. */
const CATEGORY_ORDER: AnchorCategory[] = [
  "branded",
  "naked-url",
  "descriptive",
  "generic",
  "empty",
];

const GENERIC_ANCHORS = new Set([
  "click here",
  "here",
  "this",
  "read more",
  "learn more",
  "more",
  "more info",
  "more information",
  "link",
  "this link",
  "website",
  "web site",
  "visit",
  "visit site",
  "visit website",
  "homepage",
  "home page",
  "home",
  "see more",
  "find out more",
  "source",
  "reference",
  "details",
]);

/**
 * A single commercial phrase past these shares of anchor mentions is the
 * shape an anchor-text penalty audit looks for. The thresholds are deliberately
 * forgiving of small profiles, where one guest post can swing the percentage.
 */
const OVER_OPTIMIZED_SHARE = 0.3;
const WATCH_SHARE = 0.15;
const MIN_MENTIONS_FOR_VERDICT = 10;

export function computeAnchorHealth(
  rows: AnchorHealthRow[],
  target: string,
): AnchorHealth | null {
  const brandTokens = extractBrandTokens(target);
  const counts = new Map<AnchorCategory, number>();
  let totalMentions = 0;
  let topCommercial: AnchorConcentration | null = null;

  for (const row of rows) {
    // Referring domains rather than backlinks: one site linking a thousand
    // times with the same anchor is one endorsement, not a thousand.
    const mentions = row.referringDomains ?? row.backlinks ?? 0;
    if (mentions <= 0) continue;

    const category = classifyAnchor(row.anchor, brandTokens);
    counts.set(category, (counts.get(category) ?? 0) + mentions);
    totalMentions += mentions;

    if (
      category === "descriptive" &&
      row.anchor &&
      (topCommercial == null || mentions > topCommercial.mentions)
    ) {
      topCommercial = { anchor: row.anchor, mentions, share: 0 };
    }
  }

  if (totalMentions === 0) return null;

  if (topCommercial) {
    topCommercial = {
      ...topCommercial,
      share: topCommercial.mentions / totalMentions,
    };
  }

  const categories = CATEGORY_ORDER.flatMap((category) => {
    const mentions = counts.get(category) ?? 0;
    return mentions > 0
      ? [
          {
            category,
            label: CATEGORY_LABELS[category],
            mentions,
            share: mentions / totalMentions,
          },
        ]
      : [];
  });

  return {
    totalMentions,
    categories,
    topCommercial,
    ...describeAnchorProfile(topCommercial, totalMentions),
  };
}

function describeAnchorProfile(
  topCommercial: AnchorConcentration | null,
  totalMentions: number,
): { verdict: AnchorHealth["verdict"]; note: string } {
  if (!topCommercial || totalMentions < MIN_MENTIONS_FOR_VERDICT) {
    return {
      verdict: "healthy",
      note: "No single phrase dominates the anchor text.",
    };
  }

  const percent = Math.round(topCommercial.share * 100);
  if (topCommercial.share >= OVER_OPTIMIZED_SHARE) {
    return {
      verdict: "over-optimized",
      note: `"${topCommercial.anchor}" accounts for ${percent}% of anchor mentions. That much repetition of one commercial phrase is the pattern manual reviews look for — vary future anchors toward brand and URL forms.`,
    };
  }
  if (topCommercial.share >= WATCH_SHARE) {
    return {
      verdict: "watch",
      note: `"${topCommercial.anchor}" accounts for ${percent}% of anchor mentions. Not a problem yet, but keep new links away from that exact phrase.`,
    };
  }
  return {
    verdict: "healthy",
    note: `The most common phrase anchor is "${topCommercial.anchor}" at ${percent}% of anchor mentions — a natural spread.`,
  };
}

export function classifyAnchor(
  anchor: string | null | undefined,
  brandTokens: string[],
): AnchorCategory {
  const trimmed = anchor?.trim() ?? "";
  if (trimmed === "") return "empty";

  const lower = trimmed.toLowerCase();
  if (isUrlLike(lower)) return "naked-url";
  if (GENERIC_ANCHORS.has(lower)) return "generic";
  if (brandTokens.some((token) => lower.includes(token))) return "branded";
  return "descriptive";
}

function isUrlLike(lower: string): boolean {
  if (lower.startsWith("http://") || lower.startsWith("https://")) return true;
  if (lower.startsWith("www.")) return true;
  // A bare "example.com" or "example.com/pricing" with no spaces reads as a URL
  // anchor; anything with whitespace is prose that happens to name a domain.
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(lower);
}

/**
 * Brand tokens taken from the domain itself: `deliotx.com` -> `deliotx`, and
 * `fly-rocket-seo.co.uk` also yields `fly rocket seo` so a spaced-out brand
 * anchor still counts as branded.
 */
export function extractBrandTokens(target: string): string[] {
  const host = target
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  if (!host) return [];

  const label = host.split(".")[0];
  if (!label || label.length < 3) return [];

  const tokens = new Set<string>([label]);
  if (label.includes("-")) {
    tokens.add(label.replace(/-/g, " "));
    tokens.add(label.replace(/-/g, ""));
  }
  return [...tokens];
}
