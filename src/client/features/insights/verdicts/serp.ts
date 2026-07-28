import { unknownVerdict, type Verdict } from "../types";

/**
 * Reads a SERP the way a practitioner would: is this field beatable by a site
 * of our authority, and if not, what is the nearer target?
 *
 * Authority is a blunt proxy for winnability, so the thresholds below are
 * deliberately wide — the card should decline to call a close contest rather
 * than pretend precision it does not have.
 */

type SerpVerdictInput = {
  keyword: string;
  /** The project domain's rating, when we know it. */
  ownDomainRating: number | null;
  /** Ratings of the ranked results, nulls already removed. */
  competitorRatings: number[];
  /** How many results this SERP was judged against in total — the
   *  denominator for how thin the rated sample is, e.g. "2 of 10 results
   *  have a known rating." Always >= competitorRatings.length. */
  resultCount: number;
  /** People-also-ask questions, used to name a nearer target. */
  paaQuestions: string[];
};

/** Median authority of the field is more honest than the mean, which one
 *  Wikipedia result can drag ten points. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Inside this band the contest is close enough that authority alone should
 *  not decide it, so the verdict stays "mixed". */
const CLOSE_CONTEST_DR = 10;

/** Below this many rated results, a "median" is just those numbers restated,
 *  not a read on the field's authority — one or two domains dressed up as
 *  "the top results" is exactly the overconfident-plural failure this file
 *  exists to avoid. Three is the smallest sample where the middle value
 *  isn't simply one of only two inputs, so it's the floor for treating the
 *  field as a real sample rather than a couple of data points. Below it, the
 *  honest answer is "we don't know," not a confident claim about the field. */
const MIN_RATED_RESULTS = 3;

export function buildSerpVerdict(input: SerpVerdictInput): Verdict {
  const ratedCount = input.competitorRatings.length;
  if (ratedCount < MIN_RATED_RESULTS) {
    return unknownVerdict(
      ratedCount === 0
        ? `None of the ${input.resultCount} results in this SERP have a known domain rating, so there is nothing to measure the field's authority against.`
        : `Only ${ratedCount} of ${input.resultCount} results in this SERP have a known domain rating — too thin a sample to call this field's authority level.`,
    );
  }

  if (input.ownDomainRating == null) {
    return unknownVerdict(
      "This project's own domain rating is unknown, so there is no baseline to compare the field against.",
    );
  }

  const fieldStrength = median(input.competitorRatings);
  if (fieldStrength == null) {
    // Unreachable once ratedCount >= MIN_RATED_RESULTS (a non-empty array
    // always has a median); kept so TypeScript can narrow `fieldStrength` to
    // `number` below without an unsafe cast.
    return unknownVerdict(
      "Domain ratings are unavailable for this result set, so there is no honest read on whether the keyword is winnable.",
    );
  }

  const gap = fieldStrength - input.ownDomainRating;
  const rounded = Math.round(fieldStrength);

  if (gap <= -CLOSE_CONTEST_DR) {
    return {
      read: `The top results have a median DR of ${rounded}; your site is DR ${input.ownDomainRating} — ahead of the field on authority. Authority is unlikely to be the blocker here, so effort is better spent on the page itself.`,
      tone: "good",
      actions: [
        {
          label: `Publish or strengthen a page targeting "${input.keyword}"`,
          evidence: `Field median DR ${rounded} against your DR ${input.ownDomainRating}`,
          weight: 100,
        },
      ],
    };
  }

  if (gap < CLOSE_CONTEST_DR) {
    return {
      read: `The top results have a median DR of ${rounded} against your DR ${input.ownDomainRating} — close enough that authority is unlikely to decide this one. Effort is better spent on the page itself.`,
      tone: "mixed",
      actions: [
        {
          label: `Match the top result's depth on "${input.keyword}"`,
          evidence: `Field median DR ${rounded}, yours DR ${input.ownDomainRating} — no authority barrier`,
          weight: 100,
        },
      ],
    };
  }

  const nearerTarget = input.paaQuestions[0];
  return {
    read: `The top results have a median DR of ${rounded}; your site is DR ${input.ownDomainRating}. This keyword is out of reach directly.`,
    tone: "bad",
    actions: nearerTarget
      ? [
          {
            label: `Target "${nearerTarget}" instead`,
            evidence: `This SERP surfaced the question itself, so the demand behind it is real — long-tail questions typically face less competition than the head term`,
            weight: 100,
          },
        ]
      : [
          {
            label: "Target a longer-tail variant of this keyword",
            evidence: `A DR ${input.ownDomainRating} site does not out-rank a DR ${rounded} field head-on`,
            weight: 100,
          },
        ],
  };
}

export function serpRowNote(
  row: { domainRating: number | null },
  input: { ownDomainRating: number | null },
): string | null {
  if (row.domainRating == null || input.ownDomainRating == null) return null;
  if (row.domainRating <= input.ownDomainRating) return null;
  return `needs DR ${row.domainRating}+`;
}
