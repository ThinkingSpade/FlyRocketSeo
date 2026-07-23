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

const briefCompetitorSchema = z.object({
  rank: z.number().nullable(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  domain: z.string().nullable(),
});

const briefTermSchema = z.object({
  keyword: z.string(),
  searchVolume: z.number().nullable(),
});

/** The content brief exactly as it is cached — shared so auto-restore
 *  validates against the same definition that wrote it. */
export const contentBriefSchema = z.object({
  keyword: z.string(),
  locationCode: z.number(),
  languageCode: z.string(),
  competitors: z.array(briefCompetitorSchema),
  terms: z.array(briefTermSchema),
  paaQuestions: z.array(z.string()),
  fetchedAt: z.string(),
});
