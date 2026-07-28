import { z } from "zod";
import { STORED_GEO_BUNDLE_VERSION, storedMetricGeoSchema } from "./geo";

export const MAX_TRENDS_KEYWORDS = 5;

/** Trends' single geography (see TrendsPage.tsx's own `captureTrendsRunGeo`)
 *  -- sent purely so the server can persist it in this run's `paramsJson`;
 *  a restore reads it back directly instead of assuming the worldwide
 *  default every run without a stored bundle would otherwise fall back to. */
export const trendsGeoBundleSchema = z.object({
  v: z.literal(STORED_GEO_BUNDLE_VERSION),
  interest: storedMetricGeoSchema,
});

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
  /** Optional: older callers send nothing, and this run's history simply
   *  carries no geo bundle -- see resolveRunGeo.ts's own header for why
   *  that must degrade to "geography unknown", never an assumed national
   *  fallback (nor Trends' own worldwide default). */
  geo: trendsGeoBundleSchema.optional(),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/trends                  */
/* ------------------------------------------------------------------ */

export const trendsSearchSchema = z.object({
  q: z.string().optional(),
});

const trendsPointSchema = z.object({
  timestamp: z.number(),
  date: z.string(),
  values: z.array(z.number().nullable()),
});

export type TrendsPoint = z.infer<typeof trendsPointSchema>;

/** The trends result exactly as it is cached — shared so auto-restore
 *  validates against the same definition that wrote it. */
export const trendsResultSchema = z.object({
  keywords: z.array(z.string()),
  averages: z.array(z.number().nullable()),
  points: z.array(trendsPointSchema),
  fetchedAt: z.string(),
});
