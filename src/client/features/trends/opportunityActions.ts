import type { FitResult } from "@/shared/keyword-fit/keywordFit";
import { momentumLabel, type QueryMomentum } from "./queryMomentum";

/**
 * Turns a keyword plus its impression momentum into one thing to actually do.
 *
 * Deliberately NOT a two-dimensional position x momentum grid. A grid has
 * holes -- there is no sensible cell for "steady impressions, position 8" --
 * and filling them invents advice. Instead:
 *
 *   - WHERE THEY RANK decides the action. Ranking 6th and ranking 40th call
 *     for different work regardless of which way impressions are moving.
 *   - MOMENTUM decides the priority and supplies the reason.
 *
 * Two things override the action, because in both cases the position-based
 * advice would be actively wrong rather than merely low-priority: an
 * unreadable signal (`watch`), and impressions split across several of the
 * client's own pages (`consolidate`).
 *
 * There is no "write a new page" action here, and its absence is deliberate.
 * Every candidate comes from Search Console, and a query only appears there
 * because the site was SHOWN for it -- so a page of theirs already ranks,
 * always. Recommending a second page would invite them to compete with
 * themselves. (An earlier version emitted exactly that whenever the page
 * attribution call had been truncated, telling users "you have no page
 * ranking for this yet" about pages that plainly ranked.)
 */

export type OpportunityAction =
  | "defend"
  | "fix"
  | "expand"
  | "rebuild"
  | "consolidate"
  | "investigate"
  | "watch";

export type TrendingOpportunity = {
  keyword: string;
  action: OpportunityAction;
  /** One sentence naming the evidence, safe to render directly. */
  reason: string;
  /**
   * GSC's average position for the query at property level. It names no
   * single URL, so it may only pick a band of work -- never be presented as
   * "that page ranks #N".
   */
  position: number;
  /** The page taking the largest known share of impressions, or null when the
   *  attribution call did not cover this query. Null never means "no page". */
  page: string | null;
  pageShare: number | null;
  momentum: QueryMomentum;
  score: number;
};

/** Ranking bands, chosen for the work each implies: 1-3 is already won, 4-10
 *  is one page-quality step away, 11-20 needs real added depth, and past 20 a
 *  tweak rarely moves anything. */
const DEFEND_MAX_POSITION = 3;
const FIX_MAX_POSITION = 10;
const EXPAND_MAX_POSITION = 20;

/**
 * Below this share, no single page owns the query and the action changes.
 *
 * It changes the ACTION rather than merely appending a warning, which is what
 * an earlier version did: it rendered "Fix this page" and linked to Content
 * Optimizer while its own reason told the user their pages were competing.
 * Two contradictory instructions in one row is worse than either alone.
 */
const DOMINANT_PAGE_SHARE = 0.6;

const ACTION_LABELS: Record<OpportunityAction, string> = {
  defend: "Defend it",
  fix: "Fix this page",
  expand: "Expand it",
  rebuild: "Rebuild this page",
  consolidate: "Sort out competing pages",
  investigate: "Find out what changed",
  watch: "Watch",
};

export function opportunityActionLabel(action: OpportunityAction): string {
  return ACTION_LABELS[action];
}

function actionForPosition(position: number): OpportunityAction {
  if (position <= DEFEND_MAX_POSITION) return "defend";
  if (position <= FIX_MAX_POSITION) return "fix";
  if (position <= EXPAND_MAX_POSITION) return "expand";
  return "rebuild";
}

function reasonFor(input: {
  action: OpportunityAction;
  position: number;
  momentum: QueryMomentum;
}): string {
  const trend = momentumLabel(input.momentum).toLowerCase();
  const rank = Math.round(input.position);

  switch (input.action) {
    case "watch":
      return "Too few impressions to tell whether this is going anywhere yet.";
    case "consolidate":
      return `Several of your own pages split this query's impressions, so no single one is strong. Decide which should own it before improving anything (${trend}).`;
    case "investigate":
      return `You average #${rank} and ${trend} — a ranking or indexing loss looks exactly like this, so find the cause before writing anything.`;
    case "defend":
      return `You average #${rank} and ${trend} — refresh it before someone takes the spot.`;
    case "fix":
      return `You average #${rank}, one page-quality step from the top 3, and ${trend}.`;
    case "expand":
      return `You average #${rank} — that needs real added depth, not a tweak (${trend}).`;
    case "rebuild":
      return `You average #${rank}, too far back for a tweak to win. Rebuild the page that ranks — or give this its own page if that one is really about something else (${trend}).`;
  }
}

/**
 * Priority weight.
 *
 * Two properties this has to have, both learned from getting it wrong:
 *
 *   1. It ranks by what is AT STAKE, which for a declining query is what it
 *      used to earn, not what is left. A query that fell from 10,000
 *      impressions to 1,000 matters far more than one that rose from 467 to
 *      700; scoring on current impressions alone put the smaller one first.
 *   2. It is CONTINUOUS in the percentage. A categorical multiplier meant one
 *      extra impression at the dead-band edge (120 vs 121 against a baseline
 *      of 100) moved the score by 51%, so the list reshuffled on noise.
 *
 * The modifier is clamped because momentum should tilt the order, never
 * dominate it -- a huge percentage on a tiny keyword must not outrank a real
 * one.
 */
const MOMENTUM_TILT_MAX = 0.5;
const MOMENTUM_TILT_MIN = -0.25;

function scoreFor(momentum: QueryMomentum): number {
  if (momentum.direction === "unknown") return 0;

  const atStake = Math.max(momentum.impressions, momentum.prevImpressions ?? 0);
  if (momentum.percent === null) return atStake;

  const tilt = Math.min(
    MOMENTUM_TILT_MAX,
    Math.max(MOMENTUM_TILT_MIN, momentum.percent / 200),
  );
  return atStake * (1 + tilt);
}

export type OpportunityCandidate = {
  keyword: string;
  momentum: QueryMomentum;
  position: number;
  page: string | null;
  pageShare: number | null;
};

/**
 * Ranks candidates into a to-do list.
 *
 * A wrong-customer keyword is DROPPED, not demoted: every row here is an
 * instruction to go do work, and no version of "improve this page" is correct
 * for somebody else's customer. That differs from the Keyword Research table,
 * which demotes rather than hides because the user is browsing there rather
 * than being told what to do.
 *
 * The guarantee is only as good as the profile: with none saved the fit map is
 * empty and nothing is filtered. That is the honest failure mode -- an
 * unfiltered list rather than a falsely confident one.
 */
export function buildTrendingOpportunities(input: {
  candidates: readonly OpportunityCandidate[];
  fit: ReadonlyMap<string, FitResult>;
}): TrendingOpportunity[] {
  const out: TrendingOpportunity[] = [];

  for (const candidate of input.candidates) {
    if (input.fit.get(candidate.keyword)?.verdict === "wrong-customer") {
      continue;
    }

    const { direction } = candidate.momentum;
    const splitAcrossPages =
      candidate.pageShare !== null && candidate.pageShare < DOMINANT_PAGE_SHARE;

    const action: OpportunityAction =
      direction === "unknown"
        ? "watch"
        : splitAcrossPages
          ? "consolidate"
          : direction === "falling"
            ? "investigate"
            : actionForPosition(candidate.position);

    out.push({
      keyword: candidate.keyword,
      action,
      reason: reasonFor({
        action,
        position: candidate.position,
        momentum: candidate.momentum,
      }),
      position: candidate.position,
      page: candidate.page,
      pageShare: candidate.pageShare,
      momentum: candidate.momentum,
      score: scoreFor(candidate.momentum),
    });
  }

  return out.toSorted(
    (a, b) =>
      b.score - a.score || b.momentum.impressions - a.momentum.impressions,
  );
}
