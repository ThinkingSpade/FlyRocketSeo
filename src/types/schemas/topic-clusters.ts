import { z } from "zod";

export const topicClustersRequestSchema = z.object({
  projectId: z.string().uuid(),
  topic: z.string().trim().min(1).max(200),
  locationCode: z.number().int().positive().optional(),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/clusters                */
/* ------------------------------------------------------------------ */

export const topicClustersSearchSchema = z.object({
  q: z.string().optional(),
  loc: z.number().int().positive().optional(),
});

const clusterKeywordSchema = z.object({
  keyword: z.string(),
  searchVolume: z.number().nullable(),
  keywordDifficulty: z.number().nullable(),
});

/** The cluster plan exactly as it is cached — shared so auto-restore
 *  validates against the same definition that wrote it. */
export const topicClusterPlanSchema = z.object({
  topic: z.string(),
  locationCode: z.number(),
  languageCode: z.string(),
  hub: z.array(clusterKeywordSchema),
  clusters: z.array(
    z.object({
      name: z.string(),
      keywords: z.array(clusterKeywordSchema),
      totalVolume: z.number(),
    }),
  ),
  fetchedAt: z.string(),
});
