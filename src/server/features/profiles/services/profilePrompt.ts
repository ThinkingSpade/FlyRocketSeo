/**
 * Prompts for the two model calls behind the business profile.
 *
 * Both are deliberately narrow. The model is shown the client's OWN site text
 * and nothing else -- no keyword data, no competitor pages, no numbers -- so
 * there is nothing in its context to invent a statistic from. Its whole job is
 * to compress prose a human wrote about their own business into four short
 * fields that same human will read back and correct.
 */

export const PROFILE_DRAFT_SYSTEM_PROMPT = `You read a business's own website and summarise what they do, for an SEO tool.

Return ONLY a JSON object with these keys:
{
  "offer": string,
  "customer": string,
  "exclusions": string,
  "brandTerms": string,
  "serviceAreaKind": "local" | "regional" | "national" | "global"
}

Rules:
- "offer": one sentence, in the business's own vocabulary, describing what they sell. Prefer their nouns over yours.
- "customer": one sentence describing who buys it.
- "exclusions": the single most valuable field. One per line, each phrased as "We don't <verb> <thing>". Only list things the site gives you real reason to believe, such as a service business that places equipment rather than selling it, or one that states it does not do repairs. Each line MUST name an action (sell, hire, repair, teach, franchise, rent) — a line without one does nothing downstream. If the site gives you no honest basis for any exclusion, return an empty string. Never invent one to fill the field.
- "brandTerms": their brand and product names, one per line. Empty string if unclear.
- "serviceAreaKind": "local" for one city or metro, "regional" for a state or several metros, "national" for one country, "global" for anywhere. Choose from what the site says about where it operates, not from where it is registered.

No prose, no markdown fences, no explanation. JSON only.`;

export function buildProfileDraftPrompt(input: {
  domain: string;
  pages: ReadonlyArray<{ url: string; title: string; text: string }>;
  topQueries: readonly string[];
}): string {
  const pageBlocks = input.pages
    .map((page) =>
      `--- ${page.url}\nTITLE: ${page.title}\n${page.text}`.slice(0, 4000),
    )
    .join("\n\n");

  const queries =
    input.topQueries.length > 0
      ? `\n\nSearches this site already gets impressions for (Search Console):\n${input.topQueries.join("\n")}`
      : "";

  return `Website: ${input.domain}\n\n${pageBlocks}${queries}`;
}

export const SEED_SYSTEM_PROMPT = `You propose seed keyword phrases for an SEO tool, given a description of a business.

Return ONLY a JSON object: { "seeds": string[] }

Rules:
- 8 to 15 phrases, lowercase, 2 to 5 words each.
- Write the phrases the business's OWN customer would type when looking to hire or buy from them. Never phrases belonging to a different customer — if they place equipment rather than selling it, "vending machines for sale" is wrong no matter how related it looks.
- Respect the exclusions given. A phrase matching one is a failure.
- Do NOT add city or region names. Geography is applied separately.
- Cover the range of what they offer rather than 12 rewordings of one service.
- No brand names, no questions, no numbers.

No prose, no markdown fences. JSON only.`;

export function buildSeedPrompt(profile: {
  offer: string;
  customer: string;
  exclusions: string;
}): string {
  return [
    `What they sell: ${profile.offer}`,
    `Who buys it: ${profile.customer}`,
    profile.exclusions.trim()
      ? `What they do NOT do:\n${profile.exclusions}`
      : "What they do NOT do: (not specified)",
  ].join("\n\n");
}
