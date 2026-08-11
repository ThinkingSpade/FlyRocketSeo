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
 * Non-competitor categories the static classifier recognises
 * (`classifyCompetitorDomain.ts`). `null` on a row means "not classified as
 * one of these -- treated as a real competitor," which is the only meaning
 * `null` carries here: there is no separate "unknown" state, because a
 * domain the classifier has never heard of defaults to being a candidate
 * rival, not to being hidden.
 */
export const competitorCategories = [
  "social",
  "video",
  "marketplace",
  "directory",
  "qa_forum",
  "search_engine",
  "news",
  "education",
] as const;

export type CompetitorCategory = (typeof competitorCategories)[number];

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
  /**
   * The classifier's call on this domain, advisory only -- storage and
   * ranking never filter on it (see `classifyCompetitorDomain.ts`'s own doc
   * comment). Optional with a `null` default so a row cached before this
   * batch shipped still parses and reads as "treated as a real competitor,"
   * exactly like a legacy row's `beatsYouCount`/`coverage`/`positionDelta`
   * above.
   */
  category: z.enum(competitorCategories).nullable().default(null),
});

export type CompetitorRow = z.infer<typeof competitorRowSchema>;

/**
 * Whether a row belongs in the main competitors table, as opposed to the
 * collapsed "Not competitors" group -- the one place this decision is made,
 * shared by the table UI and the headline verdict so they can never disagree
 * about which rows count.
 *
 * A user pin always wins over the classifier: pinning a domain is the
 * operator overriding the tool's judgement with their own, so it must
 * surface as a competitor even when `category` says otherwise. There is no
 * corresponding override the other way -- an EXCLUDED domain is removed from
 * `rows` entirely by `applyProjectCompetitors` before this ever runs, so
 * exclusion never needs to be checked here.
 */
export function isCompetitorRow(
  row: Pick<CompetitorRow, "category" | "pinned">,
): boolean {
  return row.pinned || row.category == null;
}

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
  /**
   * True when the GSC pull the seed was built from came back AT the row
   * ceiling, meaning Google's clicks-descending ordering may have cut off
   * queries the client ranks lower (and has fewer clicks) on -- exactly the
   * queries this feature exists to find rivals for. Always `false` on the
   * domain-overlap fallback path: that path never consults a seed, so there
   * is no bias to report. Default `false` so a run recorded before this field
   * existed reads as "not known to be biased" rather than failing to parse.
   */
  seedTruncated: z.boolean().default(false),
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
