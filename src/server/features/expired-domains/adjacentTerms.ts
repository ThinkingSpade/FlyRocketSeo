import { generateText } from "ai";
import { buildChatAgentModel } from "@/server/lib/openrouter";
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
const MAX_TERMS = 50;
const MAX_OUTPUT_TOKENS = 1_500;
const ADJACENT_TERMS_MODEL = "minimax/minimax-m3";

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
  // Reject the reply atomically when it contains an explanation or leaked
  // reasoning trace. Filtering individual fragments is unsafe here: commas in
  // prose can leave ordinary words that also happen to be valid domain terms.
  if (looksLikeProseReply(raw)) return [];

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

function looksLikeProseReply(raw: string): boolean {
  if (/<\/?think\b/i.test(raw)) return true;

  return raw.split(/[,\n]/).some((piece) => {
    const unmarked = piece
      .trim()
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .trim();
    return unmarked.includes(":") || /[a-z]\s+[a-z]/i.test(unmarked);
  });
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
  const apiKey = await getOptionalEnvValue("OPENROUTER_API_KEY");
  if (!apiKey) return [];

  try {
    // This task is intentionally pinned: the generic chat-agent override can
    // select a provider that does not satisfy the account's ZDR policy. The
    // shared builder retains usage accounting, reasoning separation and the
    // established ZDR provider order.
    const model = buildChatAgentModel(apiKey, ADJACENT_TERMS_MODEL);
    const { finishReason, text } = await generateText({
      model,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      prompt: `The business works in: ${industryTerms.slice(0, 10).join(", ")}.
List every industry, venue type, product category and content topic connected to it -- including the industries of its likely CUSTOMERS, not only its own trade.`,
    });
    if (!text.trim()) {
      console.error("expired-domains.adjacentTerms empty response", {
        finishReason,
        textLength: text.length,
      });
      return [];
    }
    return parseAdjacentTerms(text);
  } catch (error) {
    console.error("expired-domains.adjacentTerms failed:", error);
    return [];
  }
}
