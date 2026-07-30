import { unknownVerdict, type Verdict } from "../types";

/**
 * Reads a domain overview for concentration risk: how much of the domain's
 * ranking strength sits in a thin slice of its keyword portfolio versus a
 * broad base -- the "what's at risk" question a raw traffic/keyword count
 * can't answer on its own.
 *
 * The brief's `topKeywordShare` (share of traffic held by the single
 * strongest keyword) has no source on this tab: Domain Overview's own result
 * (DomainOverviewResult, schemas/domain.ts) carries no per-keyword traffic at
 * all -- that only exists behind the Keywords tab's separate, metered,
 * explicitly-authorized "Load keywords" call, which this page's free
 * overview result never holds. Dropped rather than invented a source for it.
 * Concentration is read instead from `positionBuckets`, the Ahrefs-style
 * ranking distribution the free overview call already returns: how many of
 * the domain's ranked keywords reach page one (positions 1-10, where the
 * overwhelming majority of organic clicks land) versus how many sit further
 * back and are unlikely to be earning meaningful traffic at all.
 */

type PositionBuckets = {
  top3: number;
  pos4to10: number;
  pos11to20: number;
  pos21to50: number;
  pos51plus: number;
};

type DomainVerdictInput = {
  domain: string;
  organicKeywords: number | null;
  organicTraffic: number | null;
  /** Renamed/reshaped from the brief's `positionDistribution: { top3, top10,
   *  top100 }`, a shape that doesn't exist anywhere on this tab -- the real
   *  breakdown is the Ahrefs-style bucket set above (positionBucketsSchema,
   *  schemas/domain.ts), already fetched as part of the same overview call
   *  this page renders from (no extra fetch). */
  positionBuckets: PositionBuckets | null;
};

/** Below this many keywords with a known ranking position, a bucket
 *  breakdown is just a couple of keywords restated as a percentage, not a
 *  real distribution to read concentration from -- the same
 *  overconfident-plural failure this file exists to avoid (see serp.ts).
 *  Ten is the floor: enough for a percentage to mean more than "1 of 3". */
const MIN_TRACKED_KEYWORDS_FOR_CONCENTRATION_READ = 10;

/** Below this share of ranked keywords reaching page one, whatever traffic
 *  this domain has is riding on a small fraction of its own keyword
 *  portfolio -- concentrated enough to call fragile. Position-based click
 *  share falls off sharply past the top 10, so requiring only 1 in 10
 *  keywords to clear that bar is already a generous floor. */
const FRAGILE_PAGE_ONE_SHARE = 0.1;

/** At or above this share of ranked keywords reaching page one, enough of
 *  the portfolio is contributing clicks that no single keyword's ranking
 *  loss reads as a threat to the domain's traffic as a whole. Deliberately
 *  well under half: even large, healthy domains carry a long tail of
 *  keywords that will never reach page one. */
const BROAD_PAGE_ONE_SHARE = 0.3;

function formatCount(value: number): string {
  return value.toLocaleString();
}

function pluralize(count: number, noun: string): string {
  return `${formatCount(count)} ${noun}${count === 1 ? "" : "s"}`;
}

type ConcentrationActions = {
  protect: Verdict["actions"][number] | null;
  push: Verdict["actions"][number] | null;
};

/** The two levers concentration can point at: protect the (few) keywords
 *  already on page one, and promote the keywords one band below it -- the
 *  nearest, cheapest thing to try next. Each is independently gated on its
 *  own non-zero count so neither ever claims a lever that isn't there. */
function buildConcentrationActions(
  buckets: PositionBuckets,
  pageOnePct: number,
  bucketTotal: number,
): ConcentrationActions {
  const protect =
    buckets.top3 > 0
      ? {
          label: `Protect the ${pluralize(buckets.top3, "keyword")} ranking #1-3`,
          evidence: `Only ${pageOnePct}% of ${formatCount(bucketTotal)} ranked keywords reach page one at all`,
          weight: 100,
        }
      : null;

  const push =
    buckets.pos11to20 > 0
      ? {
          label: `Push the ${pluralize(buckets.pos11to20, "keyword")} ranking #11-20 toward page one`,
          evidence: `${pluralize(buckets.pos11to20, "keyword")} already rank just one band below page one`,
          // Lower than "protect" when both fire: promoting a keyword is a
          // less certain win than defending one you already hold.
          weight: protect ? 70 : 100,
        }
      : null;

  return { protect, push };
}

export function buildDomainVerdict(input: DomainVerdictInput): Verdict {
  if (input.organicKeywords == null && input.organicTraffic == null) {
    return unknownVerdict(
      `No organic traffic or keyword data is available for ${input.domain}, so there is nothing to judge where its traffic concentrates.`,
    );
  }

  if (input.positionBuckets == null) {
    return unknownVerdict(
      `Organic totals are known for ${input.domain}, but no ranking-position breakdown is available, so there is no way to see where its traffic concentrates.`,
    );
  }

  const { top3, pos4to10, pos11to20, pos21to50, pos51plus } =
    input.positionBuckets;
  const bucketTotal = top3 + pos4to10 + pos11to20 + pos21to50 + pos51plus;

  if (bucketTotal < MIN_TRACKED_KEYWORDS_FOR_CONCENTRATION_READ) {
    return unknownVerdict(
      bucketTotal === 0
        ? `None of ${input.domain}'s organic keywords have a known ranking position, so there is nothing to measure where its traffic concentrates.`
        : `Only ${bucketTotal} of ${input.domain}'s organic keywords have a known ranking position -- too few to say anything meaningful about where its traffic concentrates.`,
    );
  }

  const pageOneCount = top3 + pos4to10;
  const pageOneShare = pageOneCount / bucketTotal;
  const pageOnePct = Math.round(pageOneShare * 100);
  const pageOneLabel =
    pageOneCount === 0 ? "None" : pluralize(pageOneCount, "keyword");

  if (pageOneShare >= BROAD_PAGE_ONE_SHARE) {
    return {
      // Describes RANKING BREADTH and stops there. The old ending -- "a broad
      // enough base that no single ranking loss should sink this domain's
      // traffic" -- is a claim about traffic concentration, and the input holds
      // only keyword counts per position band plus one aggregate traffic total.
      // 30% of keywords on page one is compatible with one of them carrying 99%
      // of the traffic, so breadth of rankings says nothing about resilience.
      // Answering that needs per-keyword traffic estimates.
      read: `${pluralize(pageOneCount, "keyword")} of ${input.domain}'s ${formatCount(bucketTotal)} ranked keywords (${pageOnePct}%) reach page one -- a broad ranking base. Which of them actually carry the traffic needs the per-keyword breakdown.`,
      tone: "good",
      actions: [],
    };
  }

  const { protect, push } = buildConcentrationActions(
    input.positionBuckets,
    pageOnePct,
    bucketTotal,
  );

  if (pageOneShare < FRAGILE_PAGE_ONE_SHARE) {
    const actions = [protect, push].filter(
      (action): action is NonNullable<typeof action> => action != null,
    );
    return {
      read: `${pageOneLabel} of ${input.domain}'s ${formatCount(bucketTotal)} ranked keywords (${pageOnePct}%) reach page one -- whatever traffic this domain earns concentrates in that thin slice, with the rest of its ${formatCount(bucketTotal)} ranked keywords unlikely to be contributing much.`,
      tone: "bad",
      actions,
    };
  }

  return {
    read: `${pluralize(pageOneCount, "keyword")} of ${input.domain}'s ${formatCount(bucketTotal)} ranked keywords (${pageOnePct}%) reach page one -- a moderate base, not yet wide enough to call this domain's traffic resilient to losing any one ranking.`,
    tone: "mixed",
    // Only the "push" lever here, not "protect": with a moderate (not
    // fragile) base, urging defense of the few page-one keywords would
    // overstate the risk this band represents.
    actions: push ? [{ ...push, weight: 60 }] : [],
  };
}
