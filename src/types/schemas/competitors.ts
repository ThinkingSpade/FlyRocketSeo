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

/**
 * One competitor row, exactly as it is cached.
 *
 * The discovery fields below are optional with defaults rather than required:
 * this schema validates payloads restored from R2, so a run stored before
 * keyword-seeded discovery existed must still parse. A legacy row reports
 * `null` metrics and `source: "domain"` — which is true of it — instead of
 * becoming `unreadable` and vanishing from the tab's history.
 */
const competitorRowSchema = z.object({
  domain: z.string(),
  avgPosition: z.number().nullable(),
  intersections: z.number().nullable(),
  organicKeywords: z.number().nullable(),
  organicTraffic: z.number().nullable(),
  /** Share of the SEED keywords this domain ranks for, 0..1. */
  coverage: z.number().nullable().default(null),
  /** Seed keywords where this domain outranks the client. */
  beatsYouCount: z.number().nullable().default(null),
  /** median(their position) - median(client position); negative = ahead. */
  positionDelta: z.number().nullable().default(null),
  source: z.enum(["serp", "domain"]).default("domain"),
  pinned: z.boolean().default(false),
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
  /** How many seed keywords the answer was drawn from. 0 on the fallback path. */
  seedSize: z.number().default(0),
  /** Domains suppressed by this project's exclusions — never hide silently. */
  hiddenCount: z.number().default(0),
  discoveryMode: z.enum(["serp", "domain"]).default("domain"),
});

export type CompetitorsPage = z.infer<typeof competitorsPageSchema>;

/** How a competitors page's rows were found -- keyword-seeded, or the
 *  domain-overlap fallback. Derived from the page schema so the table and
 *  page components share one definition instead of retyping the union. */
export type DiscoveryMode = CompetitorsPage["discoveryMode"];

/* ------------------------------------------------------------------ */
/*  Project competitor management schemas                             */
/* ------------------------------------------------------------------ */

export const projectCompetitorListRequestSchema = z.object({
  projectId: z.string().uuid(),
});

export const projectCompetitorSetRequestSchema = z.object({
  projectId: z.string().uuid(),
  domain: domainField,
  status: z.enum(["pinned", "excluded"]),
  note: z.string().max(280).default(""),
});

export const projectCompetitorRemoveRequestSchema = z.object({
  projectId: z.string().uuid(),
  domain: domainField,
});
