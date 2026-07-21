/**
 * Plain-English narrative for the Client Report, generated from the numbers
 * we already fetched — no model call, so it costs nothing and never invents a
 * fact. Every sentence here must be defensible from the data passed in: this
 * text goes to the client's inbox.
 */

type ChangeDirection = "up" | "down" | "flat";

type DescribedChange = {
  direction: ChangeDirection;
  /** Absolute percent change, rounded to one decimal. Null when undefined. */
  percent: number | null;
  /** "a slight decrease of 9.7%" — ready to drop mid-sentence. */
  phrase: string;
};

// Wording thresholds, so a 2% wobble doesn't get reported as a swing.
const FLAT_PERCENT = 2;
const SLIGHT_PERCENT = 15;
const NOTABLE_PERCENT = 40;

function magnitudeWord(percent: number): string {
  if (percent < SLIGHT_PERCENT) return "slight";
  if (percent < NOTABLE_PERCENT) return "notable";
  return "sharp";
}

/** Describe a period-over-period move in words a client can read. */
export function describeChange(
  current: number,
  previous: number,
): DescribedChange {
  if (previous <= 0) {
    return current > 0
      ? { direction: "up", percent: null, phrase: "a new baseline this period" }
      : { direction: "flat", percent: null, phrase: "no change" };
  }

  const raw = ((current - previous) / previous) * 100;
  const percent = Math.round(Math.abs(raw) * 10) / 10;

  if (percent < FLAT_PERCENT) {
    return { direction: "flat", percent, phrase: "holding steady" };
  }

  const word = magnitudeWord(percent);
  return {
    direction: raw > 0 ? "up" : "down",
    percent,
    phrase: `a ${word} ${raw > 0 ? "increase" : "decrease"} of ${percent}%`,
  };
}

function count(value: number): string {
  return Math.round(value).toLocaleString();
}

type PerformanceTotals = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type NarrativeInput = {
  totals: PerformanceTotals;
  prevTotals: PerformanceTotals;
  /** The best page this period, if there is one. */
  topPage?: { path: string; impressions: number; clicks: number } | null;
  /** The best query this period, if there is one. */
  topQuery?: { query: string; impressions: number; clicks: number } | null;
  pagesTracked?: number;
  queriesTracked?: number;
};

/**
 * The opening summary — the one page most clients actually read. Leads with
 * the headline number, states both movements honestly, then anchors on the
 * strongest page so the story ends somewhere concrete.
 */
export function buildSummaryNarrative(input: NarrativeInput): string[] {
  const { totals, prevTotals } = input;
  const impressions = describeChange(
    totals.impressions,
    prevTotals.impressions,
  );
  const clicks = describeChange(totals.clicks, prevTotals.clicks);
  const paragraphs: string[] = [];

  const bothDown =
    impressions.direction === "down" && clicks.direction === "down";
  const opener = bothDown
    ? `Your site recorded ${count(totals.impressions)} impressions and ${count(totals.clicks)} clicks this period. Impressions saw ${impressions.phrase} and clicks ${clicks.phrase}, while the site held an average position of ${totals.position.toFixed(1)}.`
    : `Your site recorded ${count(totals.impressions)} impressions and ${count(totals.clicks)} clicks this period — impressions ${impressions.direction === "flat" ? "holding steady" : impressions.phrase}, clicks ${clicks.direction === "flat" ? "holding steady" : clicks.phrase} — at an average position of ${totals.position.toFixed(1)}.`;
  paragraphs.push(opener);

  if (input.topPage) {
    paragraphs.push(
      `Among your top-performing pages, ${input.topPage.path} drew ${count(input.topPage.impressions)} impressions and ${count(input.topPage.clicks)} clicks, making it the clearest signal of what search demand your site already captures.`,
    );
  }

  const positionMove = prevTotals.position - totals.position;
  if (prevTotals.position > 0 && Math.abs(positionMove) >= 0.1) {
    paragraphs.push(
      positionMove > 0
        ? `Average position improved by ${positionMove.toFixed(1)} places over the previous period, which is the momentum indicator worth watching: ranking gains land before traffic gains do.`
        : `Average position slipped by ${Math.abs(positionMove).toFixed(1)} places against the previous period. The recommendations at the end of this report target that directly.`,
    );
  }

  return paragraphs;
}

/** Section 01 — overall performance. */
export function buildPerformanceNarrative(input: NarrativeInput): string[] {
  const { totals } = input;
  const ctr = (totals.ctr * 100).toFixed(2);
  const paragraphs = [
    `Your website earned ${count(totals.impressions)} impressions and ${count(totals.clicks)} clicks in search this period, at an average click-through rate of ${ctr}%.`,
  ];

  if (input.queriesTracked && input.queriesTracked > 0) {
    paragraphs.push(
      `That traffic came from ${count(input.queriesTracked)} distinct search queries — the breadth of terms your content is visible for, and the pool every ranking improvement draws from.`,
    );
  }

  paragraphs.push(
    totals.position <= 10
      ? `An average position of ${totals.position.toFixed(1)} puts your typical result on page one, where clicks are actually available to win.`
      : `An average position of ${totals.position.toFixed(1)} sits below the first page for the typical query, so the fastest gains come from lifting the pages that are already close rather than chasing new terms.`,
  );

  return paragraphs;
}

/** Section 01 — click performance, focused on CTR rather than volume. */
export function buildClickNarrative(input: NarrativeInput): string[] {
  const { totals, prevTotals } = input;
  const ctr = totals.ctr * 100;
  const change = describeChange(totals.clicks, prevTotals.clicks);
  const paragraphs = [
    `Your site generated ${count(totals.clicks)} clicks from search results at a ${ctr.toFixed(2)}% click-through rate${change.direction === "flat" ? "" : `, ${change.phrase} on the previous period`}.`,
  ];

  paragraphs.push(
    ctr < 1
      ? `A CTR under 1% at this average position usually means titles and meta descriptions are being shown but not chosen — rewriting them is the cheapest available win, because the rankings are already there.`
      : `That CTR means your titles and descriptions are earning the click when you are shown. Protecting it as impressions grow is what turns visibility into visits.`,
  );

  paragraphs.push(
    `Each click is a person who chose your result over the others on the page. The pages and queries that follow show where that is happening today.`,
  );

  return paragraphs;
}

/** Section 01 — top pages table intro. */
export function buildTopPagesNarrative(
  pages: Array<{ path: string; clicks: number; impressions: number }>,
): string[] {
  if (pages.length === 0) return [];
  const best = pages[0];
  const totalClicks = pages.reduce((sum, page) => sum + page.clicks, 0);

  return [
    `Your top ${pages.length} pages account for ${count(totalClicks)} clicks this period, led by ${best.path} with ${count(best.clicks)} clicks from ${count(best.impressions)} impressions.`,
    `These are the pages already carrying the site. They are the safest place to invest — improving a page that ranks is far more reliable than starting a new one from nothing.`,
  ];
}

/** Section 01 — keyword rankings table intro. */
export function buildKeywordNarrative(
  queries: Array<{ query: string; clicks: number; impressions: number }>,
  positionMove: number | null,
): string[] {
  if (queries.length === 0) return [];
  const best = queries[0];
  const paragraphs = [
    `Your site drew search impressions for ${queries.length} tracked terms this period, led by "${best.query}" with ${count(best.impressions)} impressions and ${count(best.clicks)} clicks.`,
  ];

  if (positionMove != null && Math.abs(positionMove) >= 0.1) {
    paragraphs.push(
      positionMove > 0
        ? `Average position improved by ${positionMove.toFixed(1)} places, which points to real SEO momentum across the keyword set rather than a single lucky page.`
        : `Average position fell by ${Math.abs(positionMove).toFixed(1)} places across the set — worth reading alongside the competing-pages section below, which is the most common cause.`,
    );
  }

  return paragraphs;
}

type BacklinkNarrativeInput = {
  rank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  spamScore: number | null;
  brokenBacklinks: number | null;
};

/** Section 05 — backlink profile. */
export function buildBacklinkNarrative(
  input: BacklinkNarrativeInput,
): string[] {
  if (input.backlinks == null && input.referringDomains == null) return [];

  const paragraphs = [
    `Your site has ${count(input.backlinks ?? 0)} backlinks from ${count(input.referringDomains ?? 0)} referring domains${input.rank != null ? `, at a domain rank of ${Math.round(input.rank)}` : ""}.`,
  ];

  paragraphs.push(
    `High-quality backlinks raise domain authority, bring referral traffic, and lift rankings across the whole site rather than one page. Links from relevant, authoritative sites in your industry are worth many times a generic directory listing.`,
  );

  if (input.brokenBacklinks != null && input.brokenBacklinks > 0) {
    paragraphs.push(
      `${count(input.brokenBacklinks)} backlinks currently point at URLs that no longer resolve. Redirecting those targets recovers authority you have already earned — the cheapest link building available.`,
    );
  }

  if (input.spamScore != null && input.spamScore >= 30) {
    paragraphs.push(
      `A spam score of ${Math.round(input.spamScore)}% is high enough to be worth a review of the referring domains before pursuing new links.`,
    );
  }

  return paragraphs;
}
