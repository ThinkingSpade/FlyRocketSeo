import { z } from "zod";
import { domainField } from "@/types/schemas/domain";

const COMPETITORS_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_COMPETITORS_PAGE_SIZE = 25;

const KEYWORD_GAP_PAGE_SIZES = [50, 100, 200] as const;
export const DEFAULT_KEYWORD_GAP_PAGE_SIZE = 100;

/**
 * Keyword gap comparison modes:
 * - missing: keywords the competitor ranks for that the target does not
 * - shared: keywords both domains rank for
 * - advantage: keywords the target ranks for that the competitor does not
 */
export const keywordGapModes = ["missing", "shared", "advantage"] as const;
export type KeywordGapMode = (typeof keywordGapModes)[number];

export const competitorsListRequestSchema = z.object({
  projectId: z.string().uuid(),
  target: domainField,
  locationCode: z.number().int().positive().default(2840),
  languageCode: z.string().min(2).max(8).default("en"),
  excludeTopDomains: z.boolean().default(true),
  page: z.number().int().positive().default(1),
  pageSize: z
    .number()
    .int()
    .refine((value) =>
      (COMPETITORS_PAGE_SIZES as readonly number[]).includes(value),
    )
    .default(DEFAULT_COMPETITORS_PAGE_SIZE),
});

export const keywordGapRequestSchema = z.object({
  projectId: z.string().uuid(),
  target: domainField,
  competitor: domainField,
  mode: z.enum(keywordGapModes).default("missing"),
  locationCode: z.number().int().positive().default(2840),
  languageCode: z.string().min(2).max(8).default("en"),
  minSearchVolume: z.number().int().min(0).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z
    .number()
    .int()
    .refine((value) =>
      (KEYWORD_GAP_PAGE_SIZES as readonly number[]).includes(value),
    )
    .default(DEFAULT_KEYWORD_GAP_PAGE_SIZE),
});

const LINK_GAP_PAGE_SIZES = [50, 100] as const;
export const DEFAULT_LINK_GAP_PAGE_SIZE = 50;

export const linkGapRequestSchema = z.object({
  projectId: z.string().uuid(),
  target: domainField,
  competitor: domainField,
  page: z.number().int().positive().default(1),
  pageSize: z
    .number()
    .int()
    .refine((value) =>
      (LINK_GAP_PAGE_SIZES as readonly number[]).includes(value),
    )
    .default(DEFAULT_LINK_GAP_PAGE_SIZE),
});

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/competitors             */
/* ------------------------------------------------------------------ */

const competitorsTabs = ["competitors", "gap", "links"] as const;
export type CompetitorsTab = (typeof competitorsTabs)[number];

const optionalSearchPositiveIntParam = z.coerce
  .number()
  .int()
  .positive()
  .optional()
  .catch(undefined);

export const competitorsSearchSchema = z.object({
  target: z.string().optional(),
  competitor: z.string().optional(),
  tab: z.enum(competitorsTabs).optional(),
  mode: z.enum(keywordGapModes).optional(),
  page: optionalSearchPositiveIntParam,
});

const competitorRowSchema = z.object({
  domain: z.string(),
  avgPosition: z.number().nullable(),
  intersections: z.number().nullable(),
  organicKeywords: z.number().nullable(),
  organicTraffic: z.number().nullable(),
});

export type CompetitorRow = z.infer<typeof competitorRowSchema>;

/**
 * A page of competitor rows, exactly as it is cached.
 *
 * Lives here rather than beside the service that writes it so auto-restore can
 * validate a stored payload against the same definition from the client, where
 * importing the service itself would drag DataForSEO code into the bundle.
 */
export const competitorsPageSchema = z.object({
  rows: z.array(competitorRowSchema),
  totalCount: z.number().nullable(),
  fetchedAt: z.string(),
});

export type CompetitorsPage = z.infer<typeof competitorsPageSchema>;
