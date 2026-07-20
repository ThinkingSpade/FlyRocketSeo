import { z } from "zod";

export const contentBriefRequestSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().trim().min(1).max(200),
  locationCode: z.number().int().positive().optional(),
});

export const contentCompetitorRequestSchema = z.object({
  projectId: z.string().uuid(),
  url: z.string().url().max(2048),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/content                 */
/* ------------------------------------------------------------------ */

export const contentSearchSchema = z.object({
  q: z.string().optional(),
  loc: z.number().int().positive().optional(),
});
