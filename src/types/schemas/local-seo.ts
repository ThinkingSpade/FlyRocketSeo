import { z } from "zod";

export const DEFAULT_REVIEWS_DEPTH = 30;
export const MAX_REVIEWS_DEPTH = 150;

export const businessProfileRequestSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().min(1).max(200),
  locationCode: z.number().int().positive().default(2840),
  languageCode: z.string().min(2).max(8).default("en"),
});

export const startReviewsRequestSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().min(1).max(200),
  locationCode: z.number().int().positive().default(2840),
  languageCode: z.string().min(2).max(8).default("en"),
  depth: z
    .number()
    .int()
    .min(10)
    .max(MAX_REVIEWS_DEPTH)
    .default(DEFAULT_REVIEWS_DEPTH),
});

export const reviewsResultRequestSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().min(1).max(200),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/local                   */
/* ------------------------------------------------------------------ */

export const localSeoSearchSchema = z.object({
  q: z.string().optional(),
});
