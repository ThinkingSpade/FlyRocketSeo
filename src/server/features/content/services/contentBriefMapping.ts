import { z } from "zod";
import type { InstantPageAuditItem } from "@/server/lib/dataforseo/onpage";

// Pure mapping (no I/O), split from the service so it's unit-testable without
// the DataForSEO client's `cloudflare:workers` env dependency.

export type BriefTerm = {
  keyword: string;
  searchVolume: number | null;
};

export type CompetitorPage = {
  url: string;
  title: string;
  wordCount: number | null;
  h2: string[];
  h3: string[];
};

const MAX_TERMS = 25;
const MAX_HEADINGS_PER_LEVEL = 25;

// Labs related_keywords item, parsed defensively (external data): the keyword
// payload sits one level deep under keyword_data.
const relatedItemSchema = z
  .object({
    keyword_data: z
      .object({
        keyword: z.string().nullable().optional(),
        keyword_info: z
          .object({ search_volume: z.number().nullable().optional() })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

/** Extract de-duped related terms sorted by volume (nulls last). */
export function extractBriefTerms(items: unknown[]): BriefTerm[] {
  const byKeyword = new Map<string, BriefTerm>();
  for (const raw of items) {
    const parsed = relatedItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const keyword = parsed.data.keyword_data?.keyword?.trim().toLowerCase();
    if (!keyword || byKeyword.has(keyword)) continue;
    byKeyword.set(keyword, {
      keyword,
      searchVolume:
        parsed.data.keyword_data?.keyword_info?.search_volume ?? null,
    });
  }
  return [...byKeyword.values()]
    .toSorted((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
    .slice(0, MAX_TERMS);
}

function headingStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_HEADINGS_PER_LEVEL);
}

/** Distill an instant_pages result into what a content brief needs: length and
 *  the actual heading texts (the ranking page's subtopic outline). */
export function extractCompetitorPage(
  url: string,
  item: InstantPageAuditItem,
): CompetitorPage {
  const meta = item.meta ?? {};
  const htags = meta.htags ?? {};
  return {
    url: item.url ?? url,
    title: meta.title ?? "",
    wordCount: meta.content?.plain_text_word_count ?? null,
    h2: headingStrings(htags["h2"]),
    h3: headingStrings(htags["h3"]),
  };
}
