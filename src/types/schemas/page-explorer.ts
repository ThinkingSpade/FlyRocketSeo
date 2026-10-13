import { z } from "zod";
import { investigationScopeShape } from "./page-investigation";

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
  pageView: z
    .enum(["evidence", "research"])
    .default("evidence")
    .catch("evidence"),
  ...investigationScopeShape,
});

const pageKeywordSchema = z.object({
  keyword: z.string(),
  position: z.number().int().safe().positive().nullable().catch(null),
  searchVolume: z.number().int().safe().nonnegative().nullable().catch(null),
  traffic: z.number().finite().nonnegative().nullable().catch(null),
  cpc: z.number().finite().nonnegative().nullable().catch(null),
  url: z.string().nullable(),
  relativeUrl: z.string().nullable(),
  keywordDifficulty: z.number().int().min(0).max(100).nullable().catch(null),
});

const pageBacklinksSchema = z.object({
  rank: z.number().int().min(0).max(100).nullable().catch(null),
  backlinks: z.number().int().safe().nonnegative().nullable().catch(null),
  referringDomains: z
    .number()
    .int()
    .safe()
    .nonnegative()
    .nullable()
    .catch(null),
});

/** The page-explorer result exactly as it is cached. Lives here rather than
 *  beside the service that writes it so auto-restore can validate a stored
 *  payload from the client against the same definition. */
export const pageExplorerSchema = z
  .object({
    contractVersion: z.literal(2).optional(),
    source: z.literal("DataForSEO Labs and Backlinks").optional(),
    scope: z
      .object({
        organizationId: z.string(),
        projectId: z.string(),
        url: z.string().url(),
        domain: z.string(),
        path: z.string(),
        locationCode: z.number().int().positive(),
        languageCode: z.string(),
      })
      .optional(),
    url: z.string(),
    domain: z.string(),
    path: z.string(),
    locationCode: z.number(),
    languageCode: z.string(),
    keywords: z.array(pageKeywordSchema),
    totalKeywords: z.number().int().safe().nonnegative().nullable().catch(null),
    estimatedTraffic: z.number().finite().nonnegative().nullable().catch(null),
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
    backlinksStatus: z
      .enum(["available", "no-data", "error"])
      .default("no-data"),
    fetchedAt: z.iso.datetime(),
  })
  .superRefine((result, context) => {
    if (
      result.contractVersion === 2 &&
      (!result.scope ||
        !result.source ||
        result.scope.url !== result.url ||
        result.scope.domain !== result.domain ||
        result.scope.path !== result.path ||
        result.scope.locationCode !== result.locationCode ||
        result.scope.languageCode !== result.languageCode)
    ) {
      context.addIssue({
        code: "custom",
        message: "Captured page scope disagrees with the result.",
      });
    }
  })
  .transform((result) => ({
    ...result,
    // Older versions rounded a sum with missing traffic treated as zero.
    // Preserve their useful observations without certifying that derived total.
    estimatedTraffic:
      result.contractVersion === 2 && result.scope
        ? result.estimatedTraffic
        : null,
  }));
