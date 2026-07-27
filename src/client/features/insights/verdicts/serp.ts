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

export function buildSerpVerdict(input: SerpVerdictInput): Verdict {
  const fieldStrength = median(input.competitorRatings);
  if (fieldStrength == null || input.ownDomainRating == null) {
    return unknownVerdict(
      "Domain ratings are unavailable for this result set, so there is no honest read on whether the keyword is winnable.",
    );
  }

  const gap = fieldStrength - input.ownDomainRating;
  const rounded = Math.round(fieldStrength);

  if (gap <= -CLOSE_CONTEST_DR) {
    return {
      read: `The top results average DR ${rounded}; your site is DR ${input.ownDomainRating}. You out-rank this field on authority, so ranking here is a content problem, not a link problem.`,
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
      read: `The top results average DR ${rounded} against your DR ${input.ownDomainRating} — close enough that content quality, not authority, decides this one.`,
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
    read: `The top results average DR ${rounded}; your site is DR ${input.ownDomainRating}. This keyword is out of reach directly.`,
    tone: "bad",
    actions: nearerTarget
      ? [
          {
            label: `Target "${nearerTarget}" instead`,
            evidence: `A question this SERP already surfaces, with far less authority defending it`,
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
