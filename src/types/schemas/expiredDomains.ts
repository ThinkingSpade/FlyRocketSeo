import { z } from "zod";

/**
 * The stored shape of an expired-domain finder run.
 *
 * A restored run is parsed against this before anything renders. Stored shapes
 * drift as a feature evolves, and a run recorded by an older build must fail
 * validation and fall back to the empty state rather than render half a row --
 * the restore path is exactly where a silent shape mismatch would otherwise
 * surface as a blank or wrong table.
 */
const domainExpirationStatusSchema = z.enum([
  "expired",
  "critical",
  "warning",
  "healthy",
]);

const storedExpirationSchema = z.object({
  domain: z.string(),
  expirationDate: z.string().nullable(),
  createdDate: z.string().nullable(),
  lastUpdatedDate: z.string().nullable(),
  daysToExpiration: z.number().nullable(),
  domainAgeDays: z.number().nullable(),
  domainAgeYears: z.number().nullable(),
  daysSinceLastUpdate: z.number().nullable(),
  status: domainExpirationStatusSchema.nullable(),
});

const finderRowSchema = z.object({
  domain: z.string(),
  sources: z.array(z.string()),
  evidence: z.object({
    linksToCompetitors: z.array(z.string()),
    ranksForKeywords: z.array(z.string()),
    isKnownCompetitor: z.boolean(),
  }),
  score: z.number(),
  status: domainExpirationStatusSchema,
  expiration: storedExpirationSchema,
  available: z.boolean().nullable(),
});

export const expiredDomainsResultSchema = z.object({
  rows: z.array(finderRowSchema),
  summary: z.object({
    checked: z.number(),
    surfaced: z.number(),
    failed: z.number(),
  }),
  sourcesUsed: z.array(z.string()),
  sourceErrors: z.array(z.object({ source: z.string(), code: z.string() })),
  // Older runs predate this field; default keeps them restorable.
  sourcesSkipped: z
    .array(z.object({ source: z.string(), reason: z.string() }))
    .default([]),
});
