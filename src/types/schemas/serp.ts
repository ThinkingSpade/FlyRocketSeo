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
