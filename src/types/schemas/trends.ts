import { z } from "zod";
import { STORED_GEO_BUNDLE_VERSION, storedMetricGeoSchema } from "./geo";

export const MAX_TRENDS_KEYWORDS = 5;

export const trendsCalendarDateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}, "Invalid calendar date");
export const trendsInterestSchema = z.number().min(0).max(100).nullable();

/** Trends' single geography (see TrendsPage.tsx's own `captureTrendsRunGeo`)
 *  -- sent purely so the server can persist it in this run's `paramsJson`;
 *  a restore reads it back directly instead of assuming the worldwide
 *  default every run without a stored bundle would otherwise fall back to. */
export const trendsGeoBundleSchema = z.object({
  v: z.literal(STORED_GEO_BUNDLE_VERSION),
  interest: storedMetricGeoSchema,
});

export const keywordTrendsRequestSchema = z
  .object({
    projectId: z.string().uuid(),
    keywords: z
      .array(z.string().min(1).max(100))
      .min(1)
      .max(MAX_TRENDS_KEYWORDS),
    locationCode: z.number().int().positive().optional(),
    languageCode: z.string().min(2).max(8).default("en"),
    dateFrom: trendsCalendarDateSchema.optional(),
    dateTo: trendsCalendarDateSchema.optional(),
    /** Optional: older callers send nothing, and this run's history simply
     *  carries no geo bundle -- see resolveRunGeo.ts's own header for why
     *  that must degrade to "geography unknown", never an assumed national
     *  fallback (nor Trends' own worldwide default). */
    geo: trendsGeoBundleSchema.optional(),
  })
  .refine(
    (value) =>
      !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
    "Start date must precede end date",
  );

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/trends                  */
/* ------------------------------------------------------------------ */

export const trendsSearchSchema = z.object({
  q: z.string().optional(),
});

const trendsPointSchema = z
  .object({
    timestamp: z.number().int().nonnegative().max(253402300799000),
    date: trendsCalendarDateSchema,
    values: z.array(trendsInterestSchema),
  })
  .refine(
    (point) =>
      new Date(point.timestamp).toISOString().slice(0, 10) === point.date,
    "Timestamp must match the UTC bucket date",
  );

export type TrendsPoint = z.infer<typeof trendsPointSchema>;

/** The trends result exactly as it is cached — shared so auto-restore
 *  validates against the same definition that wrote it. */
const capturedTrendsResultSchema = z
  .object({
    keywords: z.array(z.string()),
    averages: z.array(trendsInterestSchema),
    points: z.array(trendsPointSchema),
    fetchedAt: z.iso.datetime().nullable().default(null),
    contractVersion: z.union([z.literal(1), z.literal(2)]).default(1),
    dataSource: z.literal("DataForSEO Google Trends").nullable().default(null),
    scope: z
      .object({
        projectId: z.string().min(1),
        locationCode: z.number().int().positive().nullable(),
        languageCode: z.string().min(2),
        dateFrom: trendsCalendarDateSchema,
        dateTo: trendsCalendarDateSchema,
      })
      .nullable()
      .default(null),
  })
  .superRefine((value, ctx) => {
    if (
      value.averages.length !== value.keywords.length ||
      value.points.some(
        (point) => point.values.length !== value.keywords.length,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Trend columns must match keywords",
      });
    if (
      value.contractVersion === 2 &&
      (!value.scope ||
        !value.dataSource ||
        !value.fetchedAt ||
        value.scope.dateFrom > value.scope.dateTo)
    )
      ctx.addIssue({
        code: "custom",
        message: "Captured trend provenance is required",
      });
  });

/** Keep valid historical curves, but legacy records cannot certify their scope. */
function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}
function legacyInterest(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}
export const trendsResultSchema = z.preprocess((raw) => {
  if (
    !isRecord(raw) ||
    !("keywords" in raw) ||
    ("contractVersion" in raw && raw.contractVersion === 2)
  )
    return raw;
  const legacy = raw;
  return {
    ...legacy,
    contractVersion: 1,
    dataSource: null,
    scope: null,
    fetchedAt: z.iso.datetime().safeParse(legacy.fetchedAt).success
      ? legacy.fetchedAt
      : null,
    averages: Array.isArray(legacy.averages)
      ? legacy.averages.map(legacyInterest)
      : legacy.averages,
    points: Array.isArray(legacy.points)
      ? legacy.points.flatMap((point: unknown) => {
          if (!isRecord(point)) return [];
          const candidate = point;
          const normalized = {
            ...candidate,
            values: Array.isArray(candidate.values)
              ? candidate.values.map(legacyInterest)
              : candidate.values,
          };
          return trendsPointSchema.safeParse(normalized).success
            ? [normalized]
            : [];
        })
      : legacy.points,
  };
}, capturedTrendsResultSchema);
