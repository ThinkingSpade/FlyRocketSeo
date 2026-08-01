import { z } from "zod";

export const pageExplorerRequestSchema = z.object({
  projectId: z.string().uuid(),
  url: z.string().url().max(2048),
  locationCode: z.number().int().positive().optional(),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/page                    */
/* ------------------------------------------------------------------ */

export const pageExplorerSearchSchema = z.object({
  u: z.string().optional(),
  loc: z.number().int().positive().optional(),
});

const pageKeywordSchema = z.object({
  keyword: z.string(),
  position: z.number().nullable(),
  searchVolume: z.number().nullable(),
  traffic: z.number().nullable(),
  cpc: z.number().nullable(),
  url: z.string().nullable(),
  relativeUrl: z.string().nullable(),
  keywordDifficulty: z.number().nullable(),
});

const pageBacklinksSchema = z.object({
  rank: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
});

/** The page-explorer result exactly as it is cached. Lives here rather than
 *  beside the service that writes it so auto-restore can validate a stored
 *  payload from the client against the same definition. */
export const pageExplorerSchema = z.object({
  url: z.string(),
  domain: z.string(),
  path: z.string(),
  locationCode: z.number(),
  languageCode: z.string(),
  keywords: z.array(pageKeywordSchema),
  totalKeywords: z.number().nullable(),
  estimatedTraffic: z.number(),
  backlinks: pageBacklinksSchema.nullable(),
  /**
   * Why `backlinks` is null, when it is.
   *
   * The backlink lookup is a separate best-effort subcall: a failure is caught
   * and logged, `backlinks` stays null, and the parent result still succeeds.
   * That is right — a Backlinks API hiccup should not sink the keyword view —
   * but it meant a FAILED paid subcall and a page that genuinely has no
   * backlink data both rendered as two dashes with no error anywhere.
   *
   * `.default("no-data")` is load-bearing: a required field would fail
   * `safeParse` against every payload already cached under the old shape,
   * which auto-restore drops silently, so old runs would stop restoring.
   */
  backlinksStatus: z.enum(["available", "no-data", "error"]).default("no-data"),
  fetchedAt: z.string(),
});
