import { z } from "zod";

// Pure clustering (no I/O) for the Topic Cluster Planner, split out so the
// grouping rules are unit-testable without the DataForSEO client.

export type ClusterKeyword = {
  keyword: string;
  searchVolume: number | null;
  keywordDifficulty: number | null;
};

export type TopicCluster = {
  /** Human label derived from the shared modifier (e.g. "healthy"). */
  name: string;
  keywords: ClusterKeyword[];
  totalVolume: number;
};

export type TopicClusterPlan = {
  /** Close variants of the seed itself — the hub page's keyword set. */
  hub: ClusterKeyword[];
  clusters: TopicCluster[];
};

const MAX_CLUSTERS = 12;
const MAX_KEYWORDS_PER_CLUSTER = 10;

// Glue words that never define a subtopic on their own.
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "me",
  "my",
  "near",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "where",
  "which",
  "with",
  "you",
  "your",
]);

const keywordItemSchema = z
  .object({
    keyword: z.string().nullable().optional(),
    keyword_info: z
      .object({ search_volume: z.number().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
    keyword_properties: z
      .object({ keyword_difficulty: z.number().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Crude plural folding so "machines" and "machine" group together. Only used
 *  for grouping keys — displayed keywords keep their original form. */
function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Deterministic lexical clustering: strip the seed's own words and glue words
 * from each keyword; the first remaining modifier names its subtopic. Keywords
 * with no modifier left are hub variants. Single-keyword groups merge into a
 * trailing "More ideas" bucket so the plan stays readable.
 */
export function buildTopicClusters(
  seedTopic: string,
  rawItems: unknown[],
): TopicClusterPlan {
  const seedTokens = new Set(tokenize(seedTopic).map(stem));

  const hub: ClusterKeyword[] = [];
  const pending: Array<{ entry: ClusterKeyword; modifierStems: string[] }> = [];
  const displayByStem = new Map<string, string>();
  const stemFrequency = new Map<string, number>();
  const seen = new Set<string>();

  for (const raw of rawItems) {
    const parsed = keywordItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const keyword = parsed.data.keyword?.trim().toLowerCase();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);

    const entry: ClusterKeyword = {
      keyword,
      searchVolume: parsed.data.keyword_info?.search_volume ?? null,
      keywordDifficulty:
        parsed.data.keyword_properties?.keyword_difficulty ?? null,
    };

    const modifiers = tokenize(keyword).filter(
      (token) => !seedTokens.has(stem(token)) && !STOPWORDS.has(token),
    );
    if (modifiers.length === 0) {
      hub.push(entry);
      continue;
    }
    const modifierStems = [...new Set(modifiers.map(stem))];
    for (const [index, modifierStem] of modifierStems.entries()) {
      if (!displayByStem.has(modifierStem)) {
        displayByStem.set(modifierStem, modifiers[index]);
      }
      stemFrequency.set(
        modifierStem,
        (stemFrequency.get(modifierStem) ?? 0) + 1,
      );
    }
    pending.push({ entry, modifierStems });
  }

  // Assign each keyword to its most COMMON modifier across the whole corpus
  // (ties: earliest in the phrase), so "used vending machines for sale" joins
  // the "sale" cluster rather than founding a lone "used" one.
  const byModifier = new Map<string, ClusterKeyword[]>();
  for (const { entry, modifierStems } of pending) {
    let key = modifierStems[0];
    let bestFrequency = stemFrequency.get(key) ?? 0;
    for (const candidate of modifierStems.slice(1)) {
      const frequency = stemFrequency.get(candidate) ?? 0;
      if (frequency > bestFrequency) {
        key = candidate;
        bestFrequency = frequency;
      }
    }
    const list = byModifier.get(key);
    if (list) list.push(entry);
    else byModifier.set(key, [entry]);
  }

  const clusters: TopicCluster[] = [];
  const leftovers: ClusterKeyword[] = [];
  for (const [modifier, keywords] of byModifier) {
    if (keywords.length < 2) {
      leftovers.push(...keywords);
      continue;
    }
    clusters.push({
      name: titleCase(displayByStem.get(modifier) ?? modifier),
      keywords: keywords
        .toSorted((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
        .slice(0, MAX_KEYWORDS_PER_CLUSTER),
      totalVolume: keywords.reduce(
        (sum, entry) => sum + (entry.searchVolume ?? 0),
        0,
      ),
    });
  }

  const ranked = clusters
    .toSorted((a, b) => b.totalVolume - a.totalVolume)
    .slice(0, MAX_CLUSTERS);

  if (leftovers.length > 0) {
    ranked.push({
      name: "More ideas",
      keywords: leftovers
        .toSorted((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
        .slice(0, MAX_KEYWORDS_PER_CLUSTER),
      totalVolume: leftovers.reduce(
        (sum, entry) => sum + (entry.searchVolume ?? 0),
        0,
      ),
    });
  }

  return {
    hub: hub.toSorted((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1)),
    clusters: ranked,
  };
}
