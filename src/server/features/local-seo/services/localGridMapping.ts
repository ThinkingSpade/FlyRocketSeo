import { z } from "zod";

// Pure mapping (no I/O) for the Local Rank Grid, split out so the position
// matching is unit-testable without the DataForSEO client.

type LocalGridCell = {
  /** 1-based rank of the project's business in the local results, or null. */
  position: number | null;
  /** The top 3 business names at this location, for "who's winning" context. */
  topCompetitors: string[];
};

// Local finder / maps items, read defensively (external data).
const localItemSchema = z
  .object({
    type: z.string().nullable().optional(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    title: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
  })
  .passthrough();

function normalizeDomain(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

function itemDomain(item: z.infer<typeof localItemSchema>): string | null {
  if (item.domain) return normalizeDomain(item.domain);
  if (item.url) {
    try {
      return normalizeDomain(new URL(item.url).hostname);
    } catch {
      return null;
    }
  }
  return null;
}

/** Find the project's business in local results by website domain and collect
 *  the leading competitors. Items without a rank are skipped. */
export function mapLocalGridCell(
  rawItems: unknown[],
  projectDomain: string,
): LocalGridCell {
  const target = normalizeDomain(projectDomain);
  const items = rawItems
    .map((raw) => localItemSchema.safeParse(raw))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .filter((item) => (item.rank_group ?? item.rank_absolute) != null)
    .toSorted(
      (a, b) =>
        (a.rank_group ?? a.rank_absolute ?? 0) -
        (b.rank_group ?? b.rank_absolute ?? 0),
    );

  let position: number | null = null;
  for (const item of items) {
    const domain = itemDomain(item);
    if (domain && (domain === target || domain.endsWith(`.${target}`))) {
      position = item.rank_group ?? item.rank_absolute ?? null;
      break;
    }
  }

  const topCompetitors = items
    .slice(0, 3)
    .map((item) => item.title?.trim())
    .filter((title): title is string => Boolean(title));

  return { position, topCompetitors };
}
