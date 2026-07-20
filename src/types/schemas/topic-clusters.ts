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
