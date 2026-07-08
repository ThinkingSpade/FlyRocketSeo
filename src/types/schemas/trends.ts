import { z } from "zod";

export const MAX_TRENDS_KEYWORDS = 5;

export const keywordTrendsRequestSchema = z.object({
  projectId: z.string().uuid(),
  keywords: z.array(z.string().min(1).max(100)).min(1).max(MAX_TRENDS_KEYWORDS),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).default("en"),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/trends                  */
/* ------------------------------------------------------------------ */

export const trendsSearchSchema = z.object({
  q: z.string().optional(),
});
