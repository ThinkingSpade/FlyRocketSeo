import { generateObject } from "ai";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getChatAgentModel } from "@/server/lib/openrouter";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { PageOptimizationRepository } from "@/server/features/onpage/repositories/PageOptimizationRepository";
import { ProjectProfileRepository } from "@/server/features/profiles/repositories/ProjectProfileRepository";
import { META_MAX, TITLE_MAX } from "@/server/lib/onpage/suggestions";
import {
  buildProfileBlock,
  type RewriteProfile,
} from "@/server/lib/onpage/promptProfile";
import { MAX_AI_REWRITE_PER_CLICK } from "@/shared/onpage-limits";

// Never rewrite more than this in one click — one OpenRouter call, bounded
// cost. The same constant bounds the input schema and the button's selection,
// so a click can no longer ask for more than this path will do.
const MAX_REWRITE = MAX_AI_REWRITE_PER_CLICK;

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
async function isAiRewriteAvailable(): Promise<boolean> {
  return Boolean(await getOptionalEnvValue("OPENROUTER_API_KEY"));
}

/**
 * What the user already told the app their business is, when they have
 * confirmed it.
 *
 * Null covers both "never filled in" and "an AI draft nobody has accepted" —
 * the same gate SAM applies, because writing marketing copy from an
 * unconfirmed draft states a proposal as fact about someone's business.
 */
async function getConfirmedProfile(
  projectId: string,
): Promise<RewriteProfile | null> {
  const row = await ProjectProfileRepository.getByProject(projectId);
  if (!row || !row.confirmedAt) return null;
  return {
    offer: row.offer,
    customer: row.customer,
    exclusions: row.exclusions,
  };
}

function buildPrompt(
  targets: RewriteTarget[],
  profile: RewriteProfile | null,
): string {
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
    ...buildProfileBlock(profile),
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

  // Read after the early return: a rewrite with nothing to rewrite should not
  // cost a D1 query either.
  const profile = await getConfirmedProfile(projectId);

  const model = await getChatAgentModel();
  const { object } = await generateObject({
    model,
    schema: rewriteSchema,
    prompt: buildPrompt(targets, profile),
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
