import { unknownVerdict, type Verdict } from "../types";

/**
 * Two unrelated reads that happen to share a tab family:
 *
 * `buildKeywordsVerdict` reads a Keyword Research result the way a
 * practitioner would: not "how many keywords did we find" but "how many of
 * them could this site actually rank for". Difficulty score and domain
 * rating are scored on the same 0-100 scale (see KeywordResearchRow,
 * types/keywords.ts, and the column's own tooltip), so comparing them
 * directly is the same reachability read `serp.ts` already makes for a
 * single SERP, just run across a batch of keywords instead of one field of
 * competitors.
 *
 * `buildTrendsVerdict` reads the Keyword Trends tab's monthly interest data
 * for a publish-timing window: does the series show a real seasonal swing,
 * and if so, when should content targeting it go live.
 */

type KeywordCandidate = {
  keyword: string;
  searchVolume: number | null;
  /** Renamed from the brief's bare `difficulty` -- the real row type
   *  (KeywordResearchRow, types/keywords.ts) calls this `keywordDifficulty`. */
  keywordDifficulty: number | null;
};

type KeywordsVerdictInput = {
  seed: string;
  rows: KeywordCandidate[];
  /** The project's own domain rating, for the reachability call. */
  ownDomainRating: number | null;
};

/** Below this many rows with a known difficulty score, "N winnable" is just
 *  a couple of keywords restated as a fraction, not a real read on the
 *  batch -- the same evidence-floor discipline as serp.ts's
 *  MIN_RATED_RESULTS, applied to a batch of keywords instead of a field of
 *  competitors. */
const MIN_RATED_KEYWORDS_FOR_REACHABILITY_READ = 3;

/** At or above this share of rated keywords being within reach, the batch as
 *  a whole is worth calling winnable rather than just naming one lucky
 *  exception. */
const WINNABLE_MAJORITY_SHARE = 0.5;

function formatCount(value: number): string {
  return value.toLocaleString();
}

type RatedKeyword = KeywordCandidate & { keywordDifficulty: number };

/** The winnable row worth acting on first: highest search volume among the
 *  reachable keywords (difficulty is already "won" for all of them, so
 *  volume is the next axis that matters), falling back to the lowest
 *  difficulty when none of them has a known volume to rank by. */
function pickBestWinnable(rows: RatedKeyword[]): RatedKeyword {
  const withVolume = rows.filter(
    (row): row is RatedKeyword & { searchVolume: number } =>
      row.searchVolume != null,
  );
  if (withVolume.length > 0) {
    return withVolume.toSorted((a, b) => b.searchVolume - a.searchVolume)[0];
  }
  return rows.toSorted((a, b) => a.keywordDifficulty - b.keywordDifficulty)[0];
}

export function buildKeywordsVerdict(input: KeywordsVerdictInput): Verdict {
  if (input.rows.length === 0) {
    return unknownVerdict(
      `No keyword results are available for "${input.seed}".`,
    );
  }

  if (input.ownDomainRating == null) {
    return unknownVerdict(
      "This project's own domain rating is unknown, so there is no baseline to judge which of these keywords are winnable.",
    );
  }
  const ownDomainRating = input.ownDomainRating;

  const rated = input.rows.filter(
    (row): row is RatedKeyword => row.keywordDifficulty != null,
  );
  if (rated.length < MIN_RATED_KEYWORDS_FOR_REACHABILITY_READ) {
    return unknownVerdict(
      rated.length === 0
        ? `None of the ${input.rows.length} keyword results for "${input.seed}" have a known difficulty score, so there is nothing to judge winnability against.`
        : `Only ${rated.length} of ${input.rows.length} keyword results for "${input.seed}" have a known difficulty score -- too thin a sample to say which are winnable.`,
    );
  }

  const winnable = rated.filter(
    (row) => row.keywordDifficulty <= ownDomainRating,
  );
  const ratedCount = rated.length;
  const winnableCount = winnable.length;
  const winnablePct = Math.round((winnableCount / ratedCount) * 100);

  if (winnableCount === 0) {
    const easiest = rated.toSorted(
      (a, b) => a.keywordDifficulty - b.keywordDifficulty,
    )[0];
    return {
      read: `None of the ${formatCount(ratedCount)} keywords with a known difficulty score are within reach of your DR ${ownDomainRating} site.`,
      tone: "bad",
      actions: [
        {
          label: `Target "${easiest.keyword}" first`,
          evidence: `Its difficulty score of ${easiest.keywordDifficulty} is the closest of this batch to your DR ${ownDomainRating}`,
          weight: 100,
        },
      ],
    };
  }

  const best = pickBestWinnable(winnable);
  const action = {
    label: `Prioritize "${best.keyword}"`,
    evidence:
      best.searchVolume != null
        ? `Volume ${formatCount(best.searchVolume)}, difficulty ${best.keywordDifficulty} vs your DR ${ownDomainRating}`
        : `Difficulty ${best.keywordDifficulty} vs your DR ${ownDomainRating}`,
    weight: 100,
  };

  if (winnableCount / ratedCount >= WINNABLE_MAJORITY_SHARE) {
    return {
      read: `${formatCount(winnableCount)} of the ${formatCount(ratedCount)} keywords with a known difficulty score (${winnablePct}%) are within reach of your DR ${ownDomainRating} site.`,
      tone: "good",
      actions: [action],
    };
  }

  return {
    read: `Only ${formatCount(winnableCount)} of the ${formatCount(ratedCount)} keywords with a known difficulty score (${winnablePct}%) are within reach of your DR ${ownDomainRating} site -- the rest need more authority than you currently have.`,
    tone: "mixed",
    actions: [action],
  };
}

export function keywordRowNote(
  row: { keywordDifficulty: number | null },
  input: { ownDomainRating: number | null },
): string | null {
  if (row.keywordDifficulty == null || input.ownDomainRating == null) {
    return null;
  }
  if (row.keywordDifficulty <= input.ownDomainRating) return null;
  return `needs DR ${row.keywordDifficulty}+`;
}

/* ------------------------------------------------------------------ */
/*  Keyword Trends                                                     */
/* ------------------------------------------------------------------ */

type TrendsVerdictInput = {
  keywords: string[];
  /** Average interest per calendar month (index 0 = January .. 11 =
   *  December), keyed by keyword -- the exact output of the Trends tab's own
   *  seasonality computation (computeMonthlyInterest, trends/trendsInsights.ts),
   *  reused rather than re-derived so this card can never name a peak/low
   *  month the heatmap beside it doesn't also show. A keyword missing from
   *  this record means that computation returned null for the whole result
   *  (the tracked series doesn't span enough of the year to read seasonality
   *  from at all); a present keyword's array can still hold nulls for a
   *  calendar month that never had a data point.
   *  Reshaped from the brief's `Record<string, number[]>` -- plain
   *  non-nullable numbers can't represent "this month never had data",
   *  which the real computation genuinely produces. */
  seriesByKeyword: Record<string, Array<number | null>>;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Below half the year having a data point, a "peak month" is just whichever
 *  few months happened to be sampled, not a real seasonal read. Six is the
 *  floor: at least half of the twelve calendar months populated. */
const MIN_MONTHS_WITH_DATA = 6;

/** Below this many points of peak-to-low gap (Google Trends' interest scale
 *  runs 0-100), the swing is within the noise a genuinely flat query can
 *  show -- there is no seasonal pattern here at all. */
const FLAT_SEASONALITY_SPREAD = 10;

/** At or above this many points of gap, the swing is large enough to plan a
 *  publish date around with real confidence. Between the two floors, a
 *  pattern exists but isn't pronounced enough to commit to. */
const MEANINGFUL_SEASONALITY_SPREAD = 20;

/** How far ahead of a seasonal peak to recommend publishing, so a new or
 *  refreshed page has time to be crawled, indexed, and gain rank before the
 *  demand window opens -- the conservative (earlier) edge of the 2-3 month
 *  lead time commonly recommended for seasonal content. */
const LEAD_TIME_MONTHS = 2;

type SeasonalRead = {
  keyword: string;
  peakMonth: number;
  peakValue: number;
  lowMonth: number;
  lowValue: number;
  spread: number;
};

function readSeasonality(
  keyword: string,
  months: Array<number | null>,
): SeasonalRead | null {
  const populated = months
    .map((value, month) => ({ month, value }))
    .filter(
      (entry): entry is { month: number; value: number } => entry.value != null,
    );
  if (populated.length < MIN_MONTHS_WITH_DATA) return null;

  const peak = populated.reduce((best, entry) =>
    entry.value > best.value ? entry : best,
  );
  const low = populated.reduce((best, entry) =>
    entry.value < best.value ? entry : best,
  );
  return {
    keyword,
    peakMonth: peak.month,
    peakValue: peak.value,
    lowMonth: low.month,
    lowValue: low.value,
    spread: peak.value - low.value,
  };
}

export function buildTrendsVerdict(input: TrendsVerdictInput): Verdict {
  const keywordList = input.keywords.join(", ");
  const keywordsWithSeries = input.keywords.filter(
    (keyword) => input.seriesByKeyword[keyword] != null,
  );
  if (keywordsWithSeries.length === 0) {
    return unknownVerdict(
      `The tracked series${keywordList ? ` for ${keywordList}` : ""} doesn't span enough of the year to say when interest peaks.`,
    );
  }

  const reads = keywordsWithSeries
    .map((keyword) =>
      readSeasonality(keyword, input.seriesByKeyword[keyword] ?? []),
    )
    .filter((read): read is SeasonalRead => read != null);
  if (reads.length === 0) {
    return unknownVerdict(
      `None of the tracked keywords (${keywordList}) have enough months of data to say when interest peaks.`,
    );
  }

  const strongest = reads.toSorted((a, b) => b.spread - a.spread)[0];
  const peakName = MONTH_NAMES[strongest.peakMonth];
  const lowName = MONTH_NAMES[strongest.lowMonth];

  if (strongest.spread < FLAT_SEASONALITY_SPREAD) {
    return {
      read: `Interest in "${strongest.keyword}" stays fairly flat across the year (peak in ${peakName} vs low in ${lowName}, only a ${strongest.spread}-point gap on the 0-100 scale) -- not a strong enough swing to plan a publish date around.`,
      tone: "bad",
      actions: [],
    };
  }

  if (strongest.spread < MEANINGFUL_SEASONALITY_SPREAD) {
    return {
      read: `"${strongest.keyword}" shows a modest seasonal swing: interest peaks in ${peakName} and dips in ${lowName}, a ${strongest.spread}-point gap -- present, but not pronounced enough to commit a publish date to.`,
      tone: "mixed",
      actions: [
        {
          label: `If timing content, lean toward publishing "${strongest.keyword}" before ${peakName}`,
          evidence: `${strongest.keyword} peaks in ${peakName} vs a low in ${lowName}, only a ${strongest.spread}-point gap`,
          weight: 50,
        },
      ],
    };
  }

  const publishMonth =
    MONTH_NAMES[(strongest.peakMonth - LEAD_TIME_MONTHS + 12) % 12];
  return {
    read: `"${strongest.keyword}" peaks in ${peakName} (interest ${strongest.peakValue} vs a low of ${strongest.lowValue} in ${lowName}) -- a real seasonal swing worth timing content around.`,
    tone: "good",
    actions: [
      {
        label: `Publish or refresh "${strongest.keyword}" content by ${publishMonth}`,
        evidence: `${strongest.keyword}'s search interest peaks in ${peakName}`,
        weight: 100,
      },
    ],
  };
}
