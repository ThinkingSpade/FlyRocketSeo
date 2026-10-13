import { z } from "zod";
import {
  providerCount,
  providerTimestamp,
} from "@/shared/provider-observations";
import { keywordScore } from "@/shared/keyword-observations";

export const topicClustersRequestSchema = z.object({
  projectId: z.string().uuid(),
  topic: z.string().trim().min(1).max(200),
  locationCode: z.number().int().positive().optional(),
  /**
   * Defect 2 fix: the project's CONFIRMED target area label at the moment
   * this run was authorized, when a sub-country one was confirmed --
   * null/omitted otherwise. Sent purely so the server can persist it for a
   * later restore; this tab's own numbers never use it (Labs
   * `keyword_suggestions` has no metro-capable equivalent), so it drives
   * only the "these numbers are nationwide" caveat, never the request
   * itself. See clusterAreaLabel.ts's own header.
   */
  confirmedAreaLabel: z.string().max(200).nullable().optional(),
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
  searchVolume: z.number().nullable().transform(providerCount),
  keywordDifficulty: z.number().nullable().transform(keywordScore),
});

/** The cluster plan exactly as it is cached — shared so auto-restore
 *  validates against the same definition that wrote it. */
export const topicClusterPlanSchema = z
  .object({
    contractVersion: z.union([z.literal(1), z.literal(2)]).default(1),
    source: z.literal("DataForSEO Labs").default("DataForSEO Labs"),
    topic: z.string(),
    locationCode: z.number(),
    languageCode: z.string(),
    hub: z.array(clusterKeywordSchema),
    clusters: z.array(
      z.object({
        name: z.string(),
        keywords: z.array(clusterKeywordSchema),
        totalVolume: z.number().nullable().transform(providerCount),
        keywordCount: z.number().int().nonnegative().optional(),
      }),
    ),
    fetchedAt: z.string().nullable().transform(providerTimestamp),
  })
  .transform((plan) => ({
    ...plan,
    clusters: plan.clusters.map((cluster) => ({
      ...cluster,
      totalVolume: plan.contractVersion === 2 ? cluster.totalVolume : null,
      keywordCount: cluster.keywordCount ?? cluster.keywords.length,
    })),
  }));
