import { generateText } from "ai";
import { getChatAgentModel } from "@/server/lib/openrouter";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * Neighbouring-industry words for a client's vertical.
 *
 * This is the step that answers "all vending, nothing vending-adjacent". The
 * client's own keywords can only ever describe the client's own vertical, so
 * reaching the industries AROUND it needs outside knowledge, and a model is the
 * cheapest source of it -- one small call, cached per project.
 *
 * The prompt deliberately reaches past neighbouring product categories to the
 * industries of the client's own CUSTOMERS. A vending operator serves schools,
 * so an education domain is a legitimate target: it is somewhere the operator
 * could publish credibly, even though education is not its trade. Narrowing to
 * "things like vending" is what made an earlier run return five vending
 * companies and nothing else.
 *
 * Terms are a strictly bounded, sanitised list because each one multiplies the
 * generated names, and every surviving name can cost an availability credit.
 * The parser is deliberately strict and separately tested: a model that decides
 * to explain itself must not turn a sentence into a domain name.
 */
const MAX_TERMS = 30;
const MAX_OUTPUT_TOKENS = 400;

const SYSTEM_PROMPT = `You list industry words for a domain-name search, for a business.
Reply with ONLY a comma-separated list of single lowercase words. No sentences, no numbering, no explanation.
Each word must be usable inside a domain name: letters only, no spaces, no punctuation.

Include words from ALL of these, not just the business's own trade:
1. Industries whose businesses would BUY from it or HOST it (a vending operator serves schools, hospitals, gyms, hotels, factories, offices).
2. The PLACES it operates in (campus, breakroom, cafeteria, lobby, warehouse, clinic).
3. Adjacent product and service categories (snacks, nutrition, coffee, water, catering, facilities, janitorial).
4. Topics its customers care about that it could credibly publish about (wellness, hydration, workplace, productivity, hospitality, education).

Be generous and wide-ranging. A word only needs to be plausibly connected to the business or its customers.`;

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
List every industry, venue type, product category and content topic connected to it -- including the industries of its likely CUSTOMERS, not only its own trade.`,
    });
    return parseAdjacentTerms(text);
  } catch (error) {
    console.error("expired-domains.adjacentTerms failed:", error);
    return [];
  }
}
