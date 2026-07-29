import { generateText } from "ai";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getChatAgentModel } from "@/server/lib/openrouter";
import {
  ProjectProfileRepository,
  type VerdictInput,
} from "@/server/features/profiles/repositories/ProjectProfileRepository";
import {
  KEYWORD_FIT_SYSTEM_PROMPT,
  buildKeywordFitPrompt,
} from "./keywordFitPrompt";
import { rethrowModelError } from "./modelErrors";

/**
 * The semantic half of keyword fit: one model call for a whole result set,
 * cached per keyword so the second look is free.
 *
 * Layered on top of the rules classifier, never instead of it. A deployment
 * with no OPENROUTER_API_KEY keeps every rules verdict; this only sharpens
 * the cases a written exclusion cannot reach (DIY, franchising, recruitment,
 * other companies' brands).
 */

const verdictsSchema = z.object({
  verdicts: z
    .array(
      z.object({
        n: z.number().int().positive(),
        verdict: z.enum(["on-offer", "adjacent", "wrong-customer"]),
        reason: z.string().max(300).default(""),
      }),
    )
    .max(200)
    .default([]),
});

/**
 * Keywords per model call.
 *
 * A result set can be 500 rows and the whole set in one prompt would both
 * blow the output ceiling and make a single malformed response cost
 * everything. Chunking bounds the blast radius: a chunk that fails leaves the
 * chunks around it cached.
 */
const KEYWORDS_PER_CALL = 40;

/** Total keywords one refine request will classify, cached ones excluded.
 *  Beyond this the user is told what was skipped rather than silently
 *  getting a partial answer. */
const MAX_KEYWORDS_PER_REQUEST = 120;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function classifyChunk(
  profile: { offer: string; customer: string; exclusions: string },
  keywords: readonly string[],
): Promise<VerdictInput[]> {
  const model = await getChatAgentModel();
  const { text } = await generateText({
    model,
    // Roughly 25 output tokens per keyword plus reasoning headroom. Left
    // unset, the provider reserves the model's whole context and OpenRouter
    // bills that reservation up front (see ProfileDraftService).
    maxOutputTokens: 6000,
    system: KEYWORD_FIT_SYSTEM_PROMPT,
    prompt: buildKeywordFitPrompt({ ...profile, keywords }),
  }).catch(rethrowModelError);

  const parsed = verdictsSchema.safeParse(parseJsonResponse(text));
  if (!parsed.success) return [];

  // Map back by the number we sent, not by order or by echoed text: a model
  // that drops or reorders entries must lose only those, never misattribute
  // a verdict to the wrong keyword.
  const out: VerdictInput[] = [];
  for (const entry of parsed.data.verdicts) {
    const keyword = keywords[entry.n - 1];
    if (!keyword) continue;
    out.push({
      keyword,
      verdict: entry.verdict,
      reason: entry.reason,
      source: "ai",
    });
  }
  return out;
}

type RefineResult = {
  verdicts: VerdictInput[];
  /** Classified this call (the rest were already cached). */
  classified: number;
  /** Dropped because the request exceeded MAX_KEYWORDS_PER_REQUEST. Surfaced
   *  rather than silently truncated. */
  skipped: number;
};

async function refine(input: {
  projectId: string;
  keywords: readonly string[];
}): Promise<RefineResult> {
  const profileRow = await ProjectProfileRepository.getByProject(
    input.projectId,
  );
  if (!profileRow || profileRow.offer.trim() === "") {
    throw new AppError(
      "INTERNAL_ERROR",
      "Describe this client first — the AI pass judges keywords against the profile, so there's nothing to judge against yet.",
    );
  }

  const unique = [...new Set(input.keywords)];
  const cached = await ProjectProfileRepository.listVerdicts(
    input.projectId,
    unique,
  );
  const cachedByKeyword = new Map(cached.map((row) => [row.keyword, row]));

  // Re-classify anything the rules decided; leave existing AI verdicts alone.
  // That is what makes a second click free rather than a second bill.
  const pending = unique.filter(
    (keyword) => cachedByKeyword.get(keyword)?.source !== "ai",
  );
  const toClassify = pending.slice(0, MAX_KEYWORDS_PER_REQUEST);
  const skipped = pending.length - toClassify.length;

  const fresh: VerdictInput[] = [];
  for (const batch of chunk(toClassify, KEYWORDS_PER_CALL)) {
    fresh.push(...(await classifyChunk(profileRow, batch)));
  }
  await ProjectProfileRepository.upsertVerdicts(input.projectId, fresh);

  const freshByKeyword = new Map(fresh.map((entry) => [entry.keyword, entry]));
  const verdicts: VerdictInput[] = unique.flatMap((keyword) => {
    const own = freshByKeyword.get(keyword);
    if (own) return [own];
    const row = cachedByKeyword.get(keyword);
    return row
      ? [
          {
            keyword: row.keyword,
            verdict: row.verdict,
            reason: row.reason,
            source: row.source,
          },
        ]
      : [];
  });

  return { verdicts, classified: fresh.length, skipped };
}

export const KeywordFitService = { refine } as const;
