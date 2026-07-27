import { unknownVerdict, type Verdict } from "../types";

/**
 * Reads a backlink profile for the two things worth acting on: links already
 * earned but now pointing at dead pages (free to reclaim), and whether the
 * profile carries enough spam risk to be worth a review.
 *
 * Broken-link recovery always outranks a spam review: fixing a redirect
 * recovers authority you already have, while a spam review is only ever a
 * caution, not a guaranteed win.
 */

type BacklinksVerdictInput = {
  target: string;
  backlinks: number | null;
  referringDomains: number | null;
  brokenBacklinks: number | null;
  /** Spam risk of the links pointing at this target (DataForSEO's
   *  backlinks_spam_score). Not the target's own spam score -- the profile
   *  call also returns that as a separate field, but this module is about the
   *  links pointing in, not the target site itself. Renamed from the brief's
   *  bare "spamScore" for exactly that reason: the source data has two
   *  differently-scoped spam scores, and "spamScore" alone doesn't say which. */
  backlinksSpamScore: number | null;
};

/** DataForSEO documents scores at or above this level as a real spam risk;
 *  the client report (reportNarrative.ts) already treats 30 as the point
 *  where a spam score is "worth a review" -- kept in step with it here. */
const HIGH_SPAM_SCORE = 30;

function formatCount(value: number): string {
  return value.toLocaleString();
}

/** States what fraction of the profile is broken when the denominator is
 *  known; falls back to a bare count when it is not, rather than computing a
 *  percentage against a total we were never given. */
function describeBrokenLinks(
  brokenBacklinks: number,
  backlinks: number | null,
): { sentence: string; evidence: string } {
  if (brokenBacklinks === 0) {
    return {
      sentence: "No backlinks currently point at broken pages.",
      evidence: "0 backlinks point at dead pages",
    };
  }

  if (backlinks != null && backlinks > 0) {
    const pct = Math.round((brokenBacklinks / backlinks) * 100);
    return {
      sentence: `${formatCount(brokenBacklinks)} of your ${formatCount(backlinks)} backlinks (${pct}%) point at pages that no longer exist -- redirecting or restoring them recovers links you already earned.`,
      evidence: `${formatCount(brokenBacklinks)} of ${formatCount(backlinks)} backlinks (${pct}%) point at dead pages`,
    };
  }

  return {
    sentence: `${formatCount(brokenBacklinks)} backlinks point at pages that no longer exist -- redirecting or restoring them recovers links you already earned.`,
    evidence: `${formatCount(brokenBacklinks)} backlinks point at dead pages`,
  };
}

function describeSpamRisk(backlinksSpamScore: number): {
  sentence: string;
  risky: boolean;
} {
  const rounded = Math.round(backlinksSpamScore);
  if (backlinksSpamScore >= HIGH_SPAM_SCORE) {
    return {
      sentence: `The backlink spam score is ${rounded}, high enough to be worth a review of the referring domains.`,
      risky: true,
    };
  }
  return {
    sentence: `The backlink spam score is ${rounded}, a healthy level.`,
    risky: false,
  };
}

export function buildBacklinksVerdict(input: BacklinksVerdictInput): Verdict {
  if (input.backlinks == null && input.referringDomains == null) {
    return unknownVerdict(
      `No backlink data is available for ${input.target}, so there is nothing to judge the link profile against.`,
    );
  }

  if (input.brokenBacklinks == null && input.backlinksSpamScore == null) {
    return unknownVerdict(
      `Backlink and referring-domain counts are available for ${input.target}, but neither broken-backlink nor spam-score data is present, so there is nothing to judge recoverability or spam risk against.`,
    );
  }

  const sentences: string[] = [];
  const actions: Verdict["actions"] = [];
  let brokenCount = 0;
  let spamRisky = false;

  if (input.brokenBacklinks != null) {
    brokenCount = input.brokenBacklinks;
    const broken = describeBrokenLinks(input.brokenBacklinks, input.backlinks);
    sentences.push(broken.sentence);
    if (brokenCount > 0) {
      actions.push({
        label: `Redirect or restore the ${formatCount(brokenCount)} broken backlink target${brokenCount === 1 ? "" : "s"}`,
        evidence: broken.evidence,
        // Highest weight: these links are already earned, so reclaiming them
        // costs nothing but a redirect -- the cheapest link building there is.
        weight: 100,
      });
    }
  }

  if (input.backlinksSpamScore != null) {
    const spam = describeSpamRisk(input.backlinksSpamScore);
    sentences.push(spam.sentence);
    spamRisky = spam.risky;
    if (spamRisky) {
      actions.push({
        label:
          "Review the referring domains behind this backlink profile for spam",
        evidence: `Backlink spam score ${Math.round(input.backlinksSpamScore)} (${HIGH_SPAM_SCORE}+ is high risk)`,
        // Below the broken-link action: a spam review is a caution, not a
        // guaranteed recovery the way redirecting a dead link is.
        weight: 70,
      });
    }
  }

  const tone: Verdict["tone"] = spamRisky
    ? "bad"
    : brokenCount > 0
      ? "mixed"
      : "good";

  return { read: sentences.join(" "), tone, actions };
}

export function backlinksRowNote(row: { isBroken: boolean }): string | null {
  return row.isBroken ? "recoverable" : null;
}
