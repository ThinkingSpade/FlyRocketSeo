import { z } from "zod";
import type { SerpLiveItem } from "@/server/lib/dataforseo/serp";

// Pure mapping (no I/O), split from the service so it's unit-testable without
// the DataForSEO client's `cloudflare:workers` env dependency.

export type SerpOverviewResult = {
  rank: number | null;
  title: string | null;
  url: string | null;
  domain: string | null;
  description: string | null;
  etv: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  previousRank: number | null;
  isNew: boolean;
  isUp: boolean;
  isDown: boolean;
};

export type SerpOverview = {
  results: SerpOverviewResult[];
  paaQuestions: string[];
  serpFeatures: Array<{ type: string; count: number }>;
  totalOrganic: number;
};

const MAX_RESULTS = 20;
const MAX_PAA_QUESTIONS = 12;

// The live-advanced item schema is passthrough, so people_also_ask items keep
// their `items` sub-array (each entry's `title` is the question). Parse it
// defensively — SERP payloads are external data.
const paaItemSchema = z
  .object({
    items: z
      .array(
        z.object({ title: z.string().nullable().optional() }).passthrough(),
      )
      .nullable()
      .optional(),
  })
  .passthrough();

function extractPaaQuestions(items: SerpLiveItem[]): string[] {
  const questions: string[] = [];
  for (const item of items) {
    if (item.type !== "people_also_ask") continue;
    const parsed = paaItemSchema.safeParse(item);
    if (!parsed.success) continue;
    for (const sub of parsed.data.items ?? []) {
      const title = sub.title?.trim();
      if (title && !questions.includes(title)) questions.push(title);
      if (questions.length >= MAX_PAA_QUESTIONS) return questions;
    }
  }
  return questions;
}

export function mapSerpOverview(items: SerpLiveItem[]): SerpOverview {
  const organic = items.filter((item) => item.type === "organic");

  const results: SerpOverviewResult[] = organic
    .slice(0, MAX_RESULTS)
    .map((item) => ({
      rank: item.rank_absolute ?? item.rank_group ?? null,
      title: item.title ?? null,
      url: item.url ?? null,
      domain: item.domain ?? null,
      description: item.description ?? null,
      etv: item.etv ?? null,
      backlinks: item.backlinks_info?.backlinks ?? null,
      referringDomains: item.backlinks_info?.referring_domains ?? null,
      previousRank: item.rank_changes?.previous_rank_absolute ?? null,
      isNew: item.rank_changes?.is_new ?? false,
      isUp: item.rank_changes?.is_up ?? false,
      isDown: item.rank_changes?.is_down ?? false,
    }));

  const featureCounts = new Map<string, number>();
  for (const item of items) {
    if (item.type === "organic" || !item.type) continue;
    featureCounts.set(item.type, (featureCounts.get(item.type) ?? 0) + 1);
  }
  const serpFeatures = [...featureCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .toSorted((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  return {
    results,
    paaQuestions: extractPaaQuestions(items),
    serpFeatures,
    totalOrganic: organic.length,
  };
}
