/**
 * The prompt for the semantic fit pass.
 *
 * The rules classifier (src/shared/keyword-fit) fires on exclusion lines the
 * user actually wrote. That is its strength -- every verdict traces back to a
 * sentence a human can point at and correct -- and also its ceiling: a
 * profile saying only "we don't sell machines" leaves "how to start a vending
 * machine business", "vending machine business franchise" and "spg vending
 * jobs" untouched, because nothing in the profile rules out DIY, franchising
 * or recruitment. All three belong to somebody else's customer.
 *
 * This pass reads the whole profile as prose and judges the same way a person
 * would. It is asked for a REASON on every verdict for the same reason the
 * rules quote the user's own line: a fit verdict the user cannot argue with
 * is one they cannot trust.
 */

export const KEYWORD_FIT_SYSTEM_PROMPT = `You decide, for an SEO tool, whether each keyword belongs to a business's own customer.

You are given a business description and a numbered list of keywords. Return ONLY a JSON object:

{ "verdicts": [ { "n": number, "verdict": "on-offer" | "adjacent" | "wrong-customer", "reason": string } ] }

Definitions:
- "on-offer": someone looking to hire or buy what this business actually provides.
- "adjacent": related to their market, but not someone ready to buy from them — research, definitions, general interest.
- "wrong-customer": someone whose search this business cannot serve, however related the topic looks. This includes people wanting to BUY the equipment when the business only places it, people wanting to START a competing business, people looking for jobs, people seeking repairs the business doesn't do, and people looking for a different kind of supplier entirely.

Rules:
- Judge by WHO IS TYPING, not by topic overlap. A keyword can share every word with the business's offer and still belong to a competitor's customer.
- Respect the stated exclusions absolutely, and extend their spirit: if they don't sell equipment, then "for sale", "used", "wholesale", "manufacturers" and "start a business" searches are all wrong-customer.
- Branded searches for OTHER companies are wrong-customer.
- "reason" must be one short clause a human can disagree with, e.g. "wants to buy a machine, not hire a service". Never restate the keyword.
- Return exactly one entry per input number. Do not skip any.

No prose, no markdown fences. JSON only.`;

export function buildKeywordFitPrompt(input: {
  offer: string;
  customer: string;
  exclusions: string;
  keywords: readonly string[];
}): string {
  const profile = [
    `What they sell: ${input.offer}`,
    input.customer.trim()
      ? `Who buys it: ${input.customer}`
      : "Who buys it: (not specified)",
    input.exclusions.trim()
      ? `What they do NOT do:\n${input.exclusions}`
      : "What they do NOT do: (not specified)",
  ].join("\n");

  const list = input.keywords
    .map((keyword, index) => `${index + 1}. ${keyword}`)
    .join("\n");

  return `${profile}\n\nKeywords:\n${list}`;
}
