import { generateText } from "ai";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getChatAgentModel } from "@/server/lib/openrouter";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { SERVICE_AREA_KINDS } from "@/shared/keyword-fit/profileTypes";
import { applyServiceAreaToSeeds } from "@/shared/keyword-fit/seedGeo";
import type { ServiceAreaKind } from "@/shared/keyword-fit/profileTypes";
import { crawlSiteText } from "./siteTextCrawl";
import {
  PROFILE_DRAFT_SYSTEM_PROMPT,
  SEED_SYSTEM_PROMPT,
  buildProfileDraftPrompt,
  buildSeedPrompt,
} from "./profilePrompt";

/**
 * Drafts a business profile from the client's own site, and proposes seed
 * keywords from that profile.
 *
 * Both are proposals. Nothing here writes to `project_profiles` -- the draft
 * goes back to the editor for a human to correct and save, which is what sets
 * `confirmedAt`. That separation is the whole reason the profile is a stored
 * record rather than a per-request inference: a wrong guess must be fixable
 * once, not re-made on every run.
 *
 * Cost: exactly one model call each, and a capped free crawl. No metered SEO
 * provider is reachable from this file.
 */

const draftSchema = z.object({
  offer: z.string().max(2000).default(""),
  customer: z.string().max(2000).default(""),
  exclusions: z.string().max(2000).default(""),
  brandTerms: z.string().max(1000).default(""),
  serviceAreaKind: z.enum(SERVICE_AREA_KINDS).default("national"),
});

const seedsSchema = z.object({
  seeds: z.array(z.string()).max(40).default([]),
});

export type ProfileDraft = z.infer<typeof draftSchema>;

async function isDraftingAvailable(): Promise<boolean> {
  return Boolean(await getOptionalEnvValue("OPENROUTER_API_KEY"));
}

function requireKey(available: boolean): void {
  if (available) return;
  // Same env var and PAYMENT_REQUIRED code ExplainService uses for its own
  // missing-key path -- the shared error-code union has no BAD_REQUEST. The
  // client hides the button whenever the runtime flag reads false, so this
  // only fires if the key is removed between page load and click.
  throw new AppError(
    "PAYMENT_REQUIRED",
    "Drafting a profile needs an OPENROUTER_API_KEY. Add it to your deployment, or fill the fields in yourself — everything else works without it.",
  );
}

/**
 * Parses a model response that is supposed to be bare JSON.
 *
 * Models wrap JSON in fences despite being told not to, so the fence is
 * stripped before parsing. A response that still doesn't parse is a failed
 * draft, never a partially-populated one: half-guessed fields presented as a
 * summary of someone's business is worse than no draft at all.
 */
function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AppError(
      "INTERNAL_ERROR",
      "The model returned something we couldn't read. Try again, or fill the fields in yourself.",
    );
  }
}

async function draftFromSite(input: {
  domain: string;
  topQueries: readonly string[];
}): Promise<ProfileDraft> {
  requireKey(await isDraftingAvailable());

  const pages = await crawlSiteText(input.domain);
  if (pages.length === 0) {
    throw new AppError(
      "INTERNAL_ERROR",
      `We couldn't read ${input.domain} — it may block automated requests. Fill the fields in yourself and everything downstream still works.`,
    );
  }

  const model = await getChatAgentModel();
  const { text } = await generateText({
    model,
    system: PROFILE_DRAFT_SYSTEM_PROMPT,
    prompt: buildProfileDraftPrompt({
      domain: input.domain,
      pages,
      topQueries: input.topQueries,
    }),
  });

  const parsed = draftSchema.safeParse(parseJsonResponse(text));
  if (!parsed.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The model's answer didn't match the expected shape. Try again, or fill the fields in yourself.",
    );
  }
  return parsed.data;
}

/**
 * Seed phrases the client's own customer would type.
 *
 * The model is asked for UNMODIFIED service phrases and geography is applied
 * afterwards by `applyServiceAreaToSeeds` -- a pure, tested rule -- rather
 * than asked for in the prompt. Models are unreliable at consistently
 * appending a place name, and this is the one part of the output where being
 * wrong points the client's whole content plan at the wrong audience.
 *
 * These are CANDIDATES, not keywords: they carry no volume until the user
 * runs them through the (metered) expansion, on an explicit click.
 */
async function generateSeeds(input: {
  offer: string;
  customer: string;
  exclusions: string;
  serviceAreaKind: ServiceAreaKind;
  areaLabel: string | null;
}): Promise<string[]> {
  requireKey(await isDraftingAvailable());

  const model = await getChatAgentModel();
  const { text } = await generateText({
    model,
    system: SEED_SYSTEM_PROMPT,
    prompt: buildSeedPrompt(input),
  });

  const parsed = seedsSchema.safeParse(parseJsonResponse(text));
  if (!parsed.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "The model's answer didn't match the expected shape. Try again.",
    );
  }

  return applyServiceAreaToSeeds(
    parsed.data.seeds,
    input.serviceAreaKind,
    input.areaLabel,
  );
}

export const ProfileDraftService = {
  isDraftingAvailable,
  draftFromSite,
  generateSeeds,
} as const;
