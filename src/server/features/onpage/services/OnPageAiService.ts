import { generateObject } from "ai";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getChatAgentModel } from "@/server/lib/openrouter";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { PageOptimizationRepository } from "@/server/features/onpage/repositories/PageOptimizationRepository";
import { META_MAX, TITLE_MAX } from "@/server/lib/onpage/suggestions";

// Never rewrite more than this in one click — one OpenRouter call, bounded cost.
const MAX_REWRITE = 25;

const rewriteSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      suggestedValue: z.string(),
    }),
  ),
});

type RewriteTarget = {
  id: string;
  element: "title" | "meta" | "h1" | "alt";
  url: string;
  currentValue: string | null;
  suggestedValue: string;
};

/** Whether AI rewriting is available at all (key configured). */
export async function isAiRewriteAvailable(): Promise<boolean> {
  return Boolean(await getOptionalEnvValue("OPENROUTER_API_KEY"));
}

function buildPrompt(targets: RewriteTarget[]): string {
  const lines = targets.map((target) => {
    const limit = target.element === "title" ? TITLE_MAX : META_MAX;
    return [
      `id: ${target.id}`,
      `element: ${target.element} (max ${limit} characters)`,
      `page: ${target.url}`,
      `current: ${target.currentValue ?? "(empty)"}`,
      `rule-based draft: ${target.suggestedValue}`,
    ].join("\n");
  });

  return [
    "You are an SEO copywriter improving on-page metadata. For each item below,",
    "write a single better version of the requested element. Keep the meaning,",
    "stay within the character limit, front-load the most important keyword, and",
    "write naturally — no keyword stuffing, no clickbait, no quotes around the",
    "text. Titles should read like a real page title; meta descriptions should",
    "be one or two plain sentences that earn the click.",
    "",
    "Return one entry per id, using the exact id given.",
    "",
    lines.join("\n\n"),
  ].join("\n");
}

/**
 * Rewrite selected title/meta suggestions with the LLM. Metered: this is the
 * one path in the feature that spends credits, and it only runs when the user
 * clicks "AI rewrite". Titles and descriptions only — headings and alt text are
 * mechanical and don't benefit from a model.
 */
async function rewrite(
  projectId: string,
  ids: string[],
): Promise<{ rewritten: number }> {
  if (!(await isAiRewriteAvailable())) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      "AI rewriting needs an OPENROUTER_API_KEY. Add it to your deployment to enable one-click rewrites.",
    );
  }

  const rows = await PageOptimizationRepository.listByIds(projectId, ids);
  const targets: RewriteTarget[] = rows
    .filter((row) => row.element === "title" || row.element === "meta")
    .slice(0, MAX_REWRITE)
    .map((row) => ({
      id: row.id,
      element: row.element,
      url: row.url,
      currentValue: row.currentValue,
      suggestedValue: row.suggestedValue,
    }));

  if (targets.length === 0) return { rewritten: 0 };

  const model = await getChatAgentModel();
  const { object } = await generateObject({
    model,
    schema: rewriteSchema,
    prompt: buildPrompt(targets),
  });

  const byId = new Map(targets.map((target) => [target.id, target]));
  const updates = object.items
    .map((item) => {
      const target = byId.get(item.id);
      const text = item.suggestedValue.trim();
      if (!target || text === "") return null;
      const limit = target.element === "title" ? TITLE_MAX : META_MAX;
      return {
        id: item.id,
        suggestedValue: text.slice(0, limit),
        reason: `AI-rewritten from the rule-based draft, tuned for ${target.element === "title" ? "the SERP title" : "click-through"}.`,
      };
    })
    .filter((update): update is NonNullable<typeof update> => update !== null);

  await PageOptimizationRepository.updateSuggestedValues(projectId, updates);
  return { rewritten: updates.length };
}

export const OnPageAiService = {
  isAiRewriteAvailable,
  rewrite,
} as const;
