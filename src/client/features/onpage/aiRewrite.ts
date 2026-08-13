import {
  isAiRewritable,
  type FixRow,
} from "@/client/features/onpage/onPageModel";
import { MAX_AI_REWRITE_PER_CLICK } from "@/shared/onpage-limits";

/**
 * What one "AI rewrite" click sends, and what it is allowed to say about it.
 *
 * This is the feature's only metered action, so the numbers on the button are a
 * spending decision rather than decoration: the user is choosing whether to pay
 * for this click. Kept pure and separate from the view model so every string
 * the button shows can be pinned by a test.
 */

export type AiRewriteSelection = {
  /** Exactly the ids one click sends. Never longer than the server accepts. */
  ids: string[];
  /** Every pending title/meta row, including the ones this click won't send. */
  eligible: number;
  /** Eligible rows this click leaves for a later one; 0 when it covers them
   *  all. Anything above 0 is what the button has to admit before it is
   *  pressed, because pressing it spends credits. */
  remaining: number;
};

/**
 * What one "AI rewrite" click actually sends.
 *
 * The rewrite is metered and bounded to one model call, so the server accepts
 * at most `MAX_AI_REWRITE_PER_CLICK` ids and rejects the request outright above
 * that. The button used to send every pending title/meta id, so a project with
 * more pending rows than the limit could not run the action at all — it failed
 * validation on every click, with no way for the user to proceed.
 *
 * Batching the extra ids into further requests was the alternative, and it is
 * the wrong one here: the bound exists to keep one click to one call of known
 * cost, and quietly turning one press into four would spend four times what the
 * user agreed to. So a click sends one batch, and the label says which.
 *
 * Rows still carrying their rule-based draft are sent first. A rewrite leaves
 * the row pending (only its text and `source` change), so without that ordering
 * a second click would re-send the same rows it just paid to rewrite and the
 * rest of the backlog would stay permanently out of reach.
 */
export function aiRewriteSelection(rows: FixRow[]): AiRewriteSelection {
  const eligible = rows.filter(isAiRewritable);
  const ids = eligible
    .toSorted((a, b) => Number(a.source === "ai") - Number(b.source === "ai"))
    .slice(0, MAX_AI_REWRITE_PER_CLICK)
    .map((row) => row.id);
  return {
    ids,
    eligible: eligible.length,
    remaining: eligible.length - ids.length,
  };
}

/**
 * The button's own label. It carries the count, so when the click covers only
 * part of the backlog the count has to say so rather than name a total the
 * action will not deliver.
 */
export function aiRewriteLabel(selection: AiRewriteSelection): string {
  return selection.remaining > 0
    ? `AI rewrite ${selection.ids.length} of ${selection.eligible}`
    : `AI rewrite (${selection.eligible})`;
}

/** Hover detail behind the label: what one click covers, and what it costs. */
export function aiRewriteHint(selection: AiRewriteSelection): string {
  return selection.remaining > 0
    ? `Rewrites ${selection.ids.length} of the ${selection.eligible} pending titles and descriptions — the most one AI call covers. Suggestions not yet rewritten go first; run it again for the next ${Math.min(selection.remaining, MAX_AI_REWRITE_PER_CLICK)}.`
    : "Rewrite pending titles and descriptions with AI";
}

/** Confirmation after a rewrite, naming what is still waiting so a partial run
 *  never reads like a finished one. */
export function aiRewriteResultMessage(
  rewritten: number,
  selection: AiRewriteSelection,
): string {
  const base = `Rewrote ${rewritten} suggestions with AI.`;
  if (selection.remaining === 0) return base;
  return `${base} ${selection.remaining} pending titles and descriptions were not part of this batch — run AI rewrite again for the next ${Math.min(selection.remaining, MAX_AI_REWRITE_PER_CLICK)}.`;
}
