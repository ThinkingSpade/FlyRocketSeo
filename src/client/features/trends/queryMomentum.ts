/**
 * Per-keyword IMPRESSION momentum from Search Console.
 *
 * Why impressions and not Google Trends: Trends thresholds out low-volume
 * terms. Measured against deliotx.com's own ranking queries it returns 0 for
 * `dallas vending services`, 0 for `dallas healthy vending`, 1 for `breakroom
 * services` and 2 for `dfw vending`, so a "what's trending" list built on it
 * would be a column of zeros. Search Console has no such threshold.
 *
 * What this is NOT: market demand. A Search Console impression means this
 * property's result was shown, so the number moves when the SITE moves, not
 * only when the market does. A page climbing from 35 to 8 gains impressions
 * against perfectly flat demand, and losing an indexed page sheds them while
 * demand grows. Every label this module produces therefore talks about
 * impressions, never about "demand" or "interest", and the consumer must not
 * relabel them.
 *
 * Two further reasons a swing here may not be real, both of which argue for
 * the wide dead band below rather than for extra cleverness:
 *
 *   - GSC's convenience ranges span an extra calendar day (`last_28_days`
 *     covers 29 dates), so adjacent windows hold different weekday mixes. A
 *     business with weekday skew can swing on the calendar alone.
 *   - The most recent 2-3 days are still settling, so a current period always
 *     under-counts slightly against a fully-settled prior one -- which biases
 *     this module toward reporting decline.
 *
 * Pure and total; the two GSC reads behind it are free and unmetered.
 */

export type MomentumDirection =
  | "rising"
  | "flat"
  | "falling"
  /**
   * The query had no prior-period row. Deliberately NOT called "new" or
   * "emerging": Search Console sorts rows by clicks, does not guarantee every
   * row even below the requested limit, and withholds anonymised queries
   * entirely -- so absence is not evidence of novelty. It is only evidence
   * that we have nothing to compare against.
   */
  | "no-baseline"
  /** Too little data to say anything honest. Never rendered as a number. */
  | "unknown";

export type QueryMomentum = {
  query: string;
  impressions: number;
  /** Null when the query had no prior-period row at all. */
  prevImpressions: number | null;
  /** Null whenever a percentage would be meaningless or infinite. */
  percent: number | null;
  direction: MomentumDirection;
};

/**
 * Below this many current impressions no verdict is issued.
 *
 * Three impressions becoming six is not "up 100%", and a tab that says so
 * stops being believed on the rows where it is right. GSC's own numbers are
 * least reliable at the bottom, where anonymised queries and rounding
 * dominate.
 */
export const MIN_IMPRESSIONS_FOR_VERDICT = 10;

/**
 * Percentage swing that still counts as flat.
 *
 * Wider than it first looks it should be, and deliberately so: it has to
 * absorb the weekday-mix and freshness artefacts described in this module's
 * header, both of which move impressions without anything real happening.
 */
export const FLAT_BAND_PERCENT = 20;

type ImpressionRow = {
  query: string;
  impressions: number;
};

/**
 * `previousTruncated` must be computed by the caller as "the prior fetch
 * returned at least its row limit". It does not change any verdict here --
 * `no-baseline` is already agnostic about why the baseline is missing -- but
 * it lets the UI explain to the user why so many rows lack a comparison.
 *
 * IMPORTANT: both `current` and `previous` must come from the SAME Search
 * Console dimension set. Google aggregates impressions per dimension set, so a
 * query x page sum is not comparable to a query-only sum; mixing them makes a
 * two-page query look doubled. See getQueryMomentum's own header.
 */
export function computeQueryMomentum(input: {
  current: readonly ImpressionRow[];
  previous: readonly ImpressionRow[];
  previousTruncated: boolean;
}): QueryMomentum[] {
  const prevByQuery = new Map<string, number>();
  for (const row of input.previous) {
    prevByQuery.set(
      row.query,
      (prevByQuery.get(row.query) ?? 0) + row.impressions,
    );
  }

  return input.current.map((row) => {
    const prevRaw = prevByQuery.get(row.query);
    // A prior row of 0 impressions is the same evidential state as no row:
    // the query did not register last period. Using it as a denominator
    // would produce Infinity.
    const prevImpressions = prevRaw != null && prevRaw > 0 ? prevRaw : null;

    if (row.impressions < MIN_IMPRESSIONS_FOR_VERDICT) {
      return {
        query: row.query,
        impressions: row.impressions,
        prevImpressions,
        percent: null,
        direction: "unknown",
      };
    }

    if (prevImpressions === null) {
      return {
        query: row.query,
        impressions: row.impressions,
        prevImpressions: null,
        // No honest percentage exists against an absent baseline.
        percent: null,
        direction: "no-baseline",
      };
    }

    const percent =
      ((row.impressions - prevImpressions) / prevImpressions) * 100;
    const direction: MomentumDirection =
      percent > FLAT_BAND_PERCENT
        ? "rising"
        : percent < -FLAT_BAND_PERCENT
          ? "falling"
          : "flat";

    return {
      query: row.query,
      impressions: row.impressions,
      prevImpressions,
      percent,
      direction,
    };
  });
}

/**
 * Human label for a direction.
 *
 * Every string here says "impressions", never "demand" or "interest" -- see
 * this module's header for why that distinction is load-bearing rather than
 * pedantic.
 */
export function momentumLabel(momentum: QueryMomentum): string {
  switch (momentum.direction) {
    case "no-baseline":
      return "No earlier figure to compare";
    case "unknown":
      return "Too few impressions to judge";
    case "flat":
      return "Impressions steady";
    case "rising":
    case "falling": {
      const percent = momentum.percent ?? 0;
      const sign = percent > 0 ? "+" : "";
      return `${sign}${Math.round(percent)}% impressions vs last period`;
    }
  }
}
