import { generateText } from "ai";
import { AppError } from "@/server/lib/errors";
import { getChatAgentModel } from "@/server/lib/openrouter";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  buildExplainPrompt,
  EXPLAIN_SYSTEM_PROMPT,
  type ExplainInput,
} from "@/server/features/insights/services/explainPrompt";

/**
 * Rewrites an already-computed verdict as plain prose.
 *
 * The model receives only the verdict's `read` and its actions' `label`/
 * `evidence` strings -- never a raw provider payload -- so there is no other
 * number anywhere in its context to draw on. See explainPrompt.ts for why
 * that's what makes a fabricated figure structurally hard rather than merely
 * discouraged.
 */

/** Whether AI explanations are available at all (key configured). */
async function isExplainAvailable(): Promise<boolean> {
  return Boolean(await getOptionalEnvValue("OPENROUTER_API_KEY"));
}

async function explainVerdict(
  input: ExplainInput,
): Promise<{ prose: string; model: string }> {
  if (!(await isExplainAvailable())) {
    // Same env var and the same PAYMENT_REQUIRED code OnPageAiService uses
    // for its missing-key error -- the shared error-code union has no
    // BAD_REQUEST. The client hides the button whenever the flag reads
    // false, so this only fires if the key is removed between page load
    // and click.
    throw new AppError(
      "PAYMENT_REQUIRED",
      "Plain-English explanations need an OPENROUTER_API_KEY. Add it to your deployment to enable them.",
    );
  }

  const model = await getChatAgentModel();
  const { text } = await generateText({
    model,
    system: EXPLAIN_SYSTEM_PROMPT,
    prompt: buildExplainPrompt(input),
  });

  return { prose: text.trim(), model: model.modelId };
}

export const ExplainService = {
  isExplainAvailable,
  explainVerdict,
} as const;
