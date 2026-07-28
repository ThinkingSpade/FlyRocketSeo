import { z } from "zod";
import { STORED_GEO_BUNDLE_VERSION, storedMetricGeoSchema } from "./geo";

/** The two geographies one Content Optimizer brief captures (see
 *  ContentOptimizerPage.tsx's own `ContentRunGeo`) -- sent purely so the
 *  server can persist it in this run's `paramsJson`; a restore reads it
 *  back directly instead of reconstructing it from the bare location codes
 *  below (`competitors` can be a metro code, indistinguishable from an
 *  unrecognised country without this). */
export const contentGeoBundleSchema = z.object({
  v: z.literal(STORED_GEO_BUNDLE_VERSION),
  competitors: storedMetricGeoSchema,
  terms: storedMetricGeoSchema,
});

export const contentBriefRequestSchema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().trim().min(1).max(200),
  locationCode: z.number().int().positive().optional(),
  /**
   * Task 6: the resolved geo for the COMPETITORS list specifically
   * (resolveRunGeo("serp", ...) on the client), which can genuinely go
   * local (a metro) even though `locationCode` above -- used for the
   * "terms to include" list and the stored/cached result -- stays
   * national-only (Labs' related_keywords has no metro-capable
   * equivalent wired up yet). Defaults to `locationCode` when omitted, so
   * every caller that doesn't know about target areas (the MCP tool,
   * older clients) is unaffected.
   */
  serpLocationCode: z.number().int().positive().optional(),
  serpLanguageCode: z.string().min(2).max(8).optional(),
  /** Optional: older callers send nothing, and this run's history simply
   *  carries no geo bundle -- see resolveRunGeo.ts's own header for why
   *  that must degrade to "geography unknown", never an assumed national
   *  fallback. */
  geo: contentGeoBundleSchema.optional(),
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
