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
 *   - MOMENTUM decides the priority and supplies the reason. Rising
 *     impressions do not change what you should do to a page ranking 6th;
 *     they change whether it is worth doing this month.
 *
 * Only ONE momentum state overrides the action: an unreadable signal, where
 * recommending anything would be guessing. Falling impressions deliberately
 * do NOT suppress the action -- see `investigate` below.
 */

export type OpportunityAction =
  | "defend"
  | "fix"
  | "expand"
  | "rebuild"
  | "write-new"
  | "investigate"
  | "watch";

export type TrendingOpportunity = {
  keyword: string;
  action: OpportunityAction;
  /** One sentence naming the evidence, safe to render directly. */
  reason: string;
  /**
   * GSC's average position for the query at property level. It names no
   * single URL -- see `getQueryMomentum` -- so it may only be used to pick a
   * band of work, never presented as "that page ranks #N".
   */
  position: number | null;
  page: string | null;
  /** Share of impressions the named page accounts for, when known. */
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
 * Below this share, no single page owns the query.
 *
 * Matters because the action names a page. When impressions are spread across
 * several URLs, "fix this page" is the wrong instruction -- the real problem
 * is usually that they compete with each other, which is Cannibalization's
 * job, not this list's.
 */
const DOMINANT_PAGE_SHARE = 0.6;

/** Weight per momentum state, relative to steady impressions. */
const MOMENTUM_WEIGHT: Record<QueryMomentum["direction"], number> = {
  rising: 1.5,
  "no-baseline": 1.1,
  flat: 1,
  // Not zero. A query losing impressions still has impressions, and a ranking
  // loss on a big keyword can be the most valuable thing on the page.
  falling: 0.9,
  unknown: 0,
};

const ACTION_LABELS: Record<OpportunityAction, string> = {
  defend: "Defend it",
  fix: "Fix this page",
  expand: "Expand it",
  rebuild: "Rebuild this page",
  "write-new": "Write a new page",
  investigate: "Find out what changed",
  watch: "Watch",
};

export function opportunityActionLabel(action: OpportunityAction): string {
  return ACTION_LABELS[action];
}

/**
 * `hasPage` separates "ranks badly" from "does not rank at all".
 *
 * A query at position 40 DOES have a ranking page, so telling the user to
 * write another one invites two of their own pages competing for the same
 * query. That case gets `rebuild`; only a candidate with no ranking page at
 * all gets `write-new`.
 */
function actionForPosition(
  position: number | null,
  hasPage: boolean,
): OpportunityAction {
  if (position === null || !hasPage) return "write-new";
  if (position <= DEFEND_MAX_POSITION) return "defend";
  if (position <= FIX_MAX_POSITION) return "fix";
  if (position <= EXPAND_MAX_POSITION) return "expand";
  return "rebuild";
}

function fanOutNote(pageShare: number | null): string {
  return pageShare !== null && pageShare < DOMINANT_PAGE_SHARE
    ? " Impressions are split across several of your pages, so check they aren't competing first."
    : "";
}

function reasonFor(input: {
  action: OpportunityAction;
  position: number | null;
  pageShare: number | null;
  momentum: QueryMomentum;
}): string {
  const trend = momentumLabel(input.momentum).toLowerCase();
  const rank = input.position === null ? null : Math.round(input.position);
  const fanOut = fanOutNote(input.pageShare);

  switch (input.action) {
    case "watch":
      return "Too few impressions to tell whether this is going anywhere yet.";
    case "investigate":
      return `You average #${rank} and ${trend} — a ranking or indexing loss looks exactly like this, so find the cause before writing anything.${fanOut}`;
    case "defend":
      return `You average #${rank} and ${trend} — refresh it before someone takes the spot.${fanOut}`;
    case "fix":
      return `You average #${rank}, one page-quality step from the top 3, and ${trend}.${fanOut}`;
    case "expand":
      // Parenthesised rather than a second sentence: `trend` is lowercased for
      // mid-sentence use, so starting a sentence with it reads as a typo.
      return `You average #${rank} — that needs real added depth, not a tweak (${trend}).${fanOut}`;
    case "rebuild":
      return `You average #${rank}, too far back for a tweak to win. Rebuild the page you already have rather than adding a second one.${fanOut}`;
    case "write-new":
      return "You have no page ranking for this yet.";
  }
}

export type OpportunityCandidate = {
  keyword: string;
  momentum: QueryMomentum;
  position: number | null;
  page: string | null;
  pageShare: number | null;
};

/**
 * Ranks candidates into a to-do list.
 *
 * A wrong-customer keyword is DROPPED, not demoted: every row here is an
 * instruction to go do work, and no version of "write this page" is correct
 * for somebody else's customer. That differs from the Keyword Research table,
 * which demotes rather than hides because the user is browsing there rather
 * than being told what to do.
 *
 * The guarantee is only as good as the profile: with none saved, the fit map
 * is empty and nothing is filtered. That is the honest failure mode -- an
 * unfiltered list rather than a falsely-confident one.
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
    const hasPage = candidate.page !== null;
    const action: OpportunityAction =
      direction === "unknown"
        ? "watch"
        : direction === "falling" && hasPage
          ? "investigate"
          : actionForPosition(candidate.position, hasPage);

    out.push({
      keyword: candidate.keyword,
      action,
      reason: reasonFor({
        action,
        position: candidate.position,
        pageShare: candidate.pageShare,
        momentum: candidate.momentum,
      }),
      position: candidate.position,
      page: candidate.page,
      pageShare: candidate.pageShare,
      momentum: candidate.momentum,
      score: candidate.momentum.impressions * MOMENTUM_WEIGHT[direction],
    });
  }

  return out.toSorted(
    (a, b) =>
      b.score - a.score || b.momentum.impressions - a.momentum.impressions,
  );
}

/** Rows we are actually recommending work on. */
export function isActionable(opportunity: TrendingOpportunity): boolean {
  return opportunity.action !== "watch";
}
