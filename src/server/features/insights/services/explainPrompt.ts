/**
 * Pure prompt assembly for ExplainService, kept in its own module so it can
 * be unit tested without pulling in the `ai` SDK or the `cloudflare:workers`
 * env lookup that ExplainService's availability check transitively touches
 * (see explainPrompt.test.ts and ExplainService.ts's own note).
 */

// Never send more than this many actions to the model in one call -- bounded
// cost, and it mirrors the server function schema's `.max()` on the same field.
export const MAX_EXPLAIN_ACTIONS = 5;

/**
 * Forbids inventing any figure not present in the input. The prompt this
 * builds contains only the verdict's `read` and its actions' `label`/
 * `evidence` strings -- there is no other number anywhere in the model's
 * context for it to draw on, which is what makes a fabricated statistic
 * structurally hard here rather than merely discouraged by instruction.
 */
export const EXPLAIN_SYSTEM_PROMPT =
  "You explain SEO findings to a non-specialist business owner. You are given a finding and a list of recommended actions, each with the evidence behind it. Rewrite them as two short paragraphs of plain English. Use ONLY the numbers given to you — never introduce a figure, percentage, or ranking that does not appear in the input. Do not add caveats about needing more data. Do not use headings or bullet points.";

export type ExplainInput = {
  tab: string;
  read: string;
  actions: Array<{ label: string; evidence: string }>;
};

/** Assembles the user-turn prompt from an already-validated ExplainInput. */
export function buildExplainPrompt(input: ExplainInput): string {
  const actions = input.actions.slice(0, MAX_EXPLAIN_ACTIONS);
  return [
    `Tab: ${input.tab}`,
    `Finding: ${input.read}`,
    "Recommended actions:",
    ...actions.map(
      (action) => `- ${action.label} (because: ${action.evidence})`,
    ),
  ].join("\n");
}
