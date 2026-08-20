import { generateText } from "ai";
import { getChatAgentModel } from "@/server/lib/openrouter";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * Neighbouring-industry words for a client's vertical.
 *
 * This is the step that answers "all vending, nothing vending-adjacent". The
 * client's own keywords can only ever describe the client's own vertical, so
 * reaching food, nutrition or break-room supply needs outside knowledge, and a
 * model is the cheapest source of it -- one small call per run.
 *
 * Terms are a strictly bounded, sanitised list because each one multiplies the
 * generated names, and every surviving name can cost an availability credit.
 * The parser is deliberately strict and separately tested: a model that decides
 * to explain itself must not turn a sentence into a domain name.
 */
const MAX_TERMS = 12;
const MAX_OUTPUT_TOKENS = 200;

const SYSTEM_PROMPT = `You list neighbouring industries for a business, for a domain-name search.
Reply with ONLY a comma-separated list of single lowercase words. No sentences, no numbering, no explanation.
Each word must be usable inside a domain name: letters only, no spaces, no punctuation.
Give words from ADJACENT industries and product categories, not synonyms of the business itself.`;

/**
 * Extracts usable terms from a model reply.
 *
 * Exported and tested on its own because it is the guard between an
 * unpredictable model and a list that decides what we spend money checking.
 */
export function parseAdjacentTerms(raw: string): string[] {
  const seen = new Set<string>();
  for (const piece of raw.split(/[,\n]/)) {
    const token = (piece.split(":").pop() ?? "")
      .trim()
      // Strip bullets and numbering a model adds despite instructions.
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .trim()
      .toLowerCase();
    if (!token) continue;
    // Single words only. A phrase is prose, and prose slugged into a hostname
    // produces nonsense nobody ever registered.
    if (!/^[a-z]{3,20}$/.test(token)) continue;
    seen.add(token);
    if (seen.size >= MAX_TERMS) break;
  }
  return [...seen];
}

/**
 * Ask for adjacent terms. Returns `[]` when no model is configured or the call
 * fails -- the acquirable search then runs on the client's own vocabulary only,
 * which is narrower but still works. Never throws: this is an enrichment step,
 * not a precondition.
 */
export async function deriveAdjacentTerms(
  industryTerms: string[],
): Promise<string[]> {
  if (industryTerms.length === 0) return [];
  if (!(await getOptionalEnvValue("OPENROUTER_API_KEY"))) return [];

  try {
    const model = await getChatAgentModel();
    const { text } = await generateText({
      model,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      prompt: `The business works in: ${industryTerms.slice(0, 10).join(", ")}.
List neighbouring industries and product categories a customer of that business also buys.`,
    });
    return parseAdjacentTerms(text);
  } catch (error) {
    console.error("expired-domains.adjacentTerms failed:", error);
    return [];
  }
}
