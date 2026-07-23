import { z } from "zod";

export const serpOverviewRequestSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().trim().min(1).max(200),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/serp                    */
/* ------------------------------------------------------------------ */

export const serpSearchSchema = z.object({
  q: z.string().optional(),
  loc: z.number().int().positive().optional(),
});

const serpOverviewResultSchema = z.object({
  rank: z.number().nullable(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  domain: z.string().nullable(),
  description: z.string().nullable(),
  etv: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  previousRank: z.number().nullable(),
  isNew: z.boolean(),
  isUp: z.boolean(),
  isDown: z.boolean(),
  /** Estimated monthly organic traffic for the result's whole domain (Labs
   *  bulk_traffic_estimation) — the plain SERP payload carries no metrics. */
  domainEtv: z.number().nullable(),
});

const keywordStatsSchema = z.object({
  searchVolume: z.number().nullable(),
  keywordDifficulty: z.number().nullable(),
  cpc: z.number().nullable(),
});

/** The SERP overview exactly as it is cached — shared so auto-restore
 *  validates against the same definition that wrote it. */
export const serpOverviewSchema = z.object({
  keyword: z.string(),
  locationCode: z.number(),
  languageCode: z.string(),
  /** The keyword's own metrics (Labs overview); null when Labs has no data. */
  keywordStats: keywordStatsSchema.nullable(),
  results: z.array(serpOverviewResultSchema),
  paaQuestions: z.array(z.string()),
  serpFeatures: z.array(z.object({ type: z.string(), count: z.number() })),
  totalOrganic: z.number(),
  fetchedAt: z.string(),
});
