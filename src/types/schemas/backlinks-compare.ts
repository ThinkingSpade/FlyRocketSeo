import { z } from "zod";

/**
 * Requests and results for the competitive half of the Backlinks tab:
 * side-by-side comparison, link intersect, competing domains and referring
 * networks. Kept apart from `backlinks.ts` so both files stay under the
 * file-size ceiling.
 */

/**
 * Four competitors is the point where a comparison table stops being readable
 * on a laptop, and it keeps the intersect request inside DataForSEO's own
 * twenty-target limit with room to spare.
 */
export const MAX_COMPARE_COMPETITORS = 4;

const competitorTargetSchema = z.string().min(1).max(255);

export const backlinksCompareRequestSchema = z.object({
  projectId: z.string().min(1),
  target: z.string().min(1).max(255),
  competitors: z
    .array(competitorTargetSchema)
    .min(1)
    .max(MAX_COMPARE_COMPETITORS),
});

const comparisonRowSchema = z.object({
  target: z.string(),
  isYou: z.boolean(),
  rank: z.number().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  referringDomainsNofollow: z.number().nullable(),
  spamScore: z.number().nullable(),
  newReferringDomains: z.number().nullable(),
  lostReferringDomains: z.number().nullable(),
  netReferringDomains: z.number().nullable(),
});

export const backlinksCompareResultSchema = z.object({
  rows: z.array(comparisonRowSchema),
  yourPosition: z.number().nullable(),
  totalTargets: z.number(),
  gapToLeader: z.number().nullable(),
  leader: z.string().nullable(),
  /** Start of the new/lost window, echoed so the UI can label the column. */
  since: z.string(),
  fetchedAt: z.string(),
});

export type BacklinksCompareResult = z.infer<
  typeof backlinksCompareResultSchema
>;
export type BacklinksComparisonRow = z.infer<typeof comparisonRowSchema>;

/* ------------------------------------------------------------------ */
/*  Link intersect                                                     */
/* ------------------------------------------------------------------ */

export const LINK_INTERSECT_PAGE_SIZE = 50;

export const linkIntersectRequestSchema = z.object({
  projectId: z.string().min(1),
  target: z.string().min(1).max(255),
  competitors: z
    .array(competitorTargetSchema)
    .min(1)
    .max(MAX_COMPARE_COMPETITORS),
  page: z.number().int().min(1).default(1),
});

const linkIntersectRowSchema = z.object({
  domain: z.string(),
  /** How many of the supplied competitors this domain links to. */
  competitorsLinked: z.number(),
  /** Which competitors, so the row can say who to study for the pitch. */
  linkedTo: z.array(z.string()),
  rank: z.number().nullable(),
  /** Total backlinks this domain points at the competitors it links to. */
  backlinks: z.number().nullable(),
  spamScore: z.number().nullable(),
  firstSeen: z.string().nullable(),
});

export const linkIntersectResultSchema = z.object({
  rows: z.array(linkIntersectRowSchema),
  totalCount: z.number().nullable(),
  hasMore: z.boolean(),
  page: z.number(),
  competitors: z.array(z.string()),
  fetchedAt: z.string(),
});

export type LinkIntersectResult = z.infer<typeof linkIntersectResultSchema>;
export type LinkIntersectRow = z.infer<typeof linkIntersectRowSchema>;

/* ------------------------------------------------------------------ */
/*  Competing domains                                                  */
/* ------------------------------------------------------------------ */

export const competingDomainsRequestSchema = z.object({
  projectId: z.string().min(1),
  target: z.string().min(1).max(255),
});

const competingDomainRowSchema = z.object({
  domain: z.string(),
  rank: z.number().nullable(),
  /** Referring domains this site shares with the analyzed target. */
  intersections: z.number().nullable(),
});

export const competingDomainsResultSchema = z.object({
  rows: z.array(competingDomainRowSchema),
  fetchedAt: z.string(),
});

export type CompetingDomainsResult = z.infer<
  typeof competingDomainsResultSchema
>;

/* ------------------------------------------------------------------ */
/*  Referring networks                                                 */
/* ------------------------------------------------------------------ */

export const referringNetworksRequestSchema = z.object({
  projectId: z.string().min(1),
  target: z.string().min(1).max(255),
});

const referringNetworkRowSchema = z.object({
  networkAddress: z.string(),
  referringDomains: z.number().nullable(),
  backlinks: z.number().nullable(),
  rank: z.number().nullable(),
});

export const referringNetworksResultSchema = z.object({
  rows: z.array(referringNetworkRowSchema),
  /** Referring domains covered by the rows returned. */
  totalDomains: z.number(),
  /** Share of those domains sitting in the three largest subnets, 0-1. */
  topThreeShare: z.number(),
  fetchedAt: z.string(),
});

export type ReferringNetworksResult = z.infer<
  typeof referringNetworksResultSchema
>;
export type ReferringNetworkRow = z.infer<typeof referringNetworkRowSchema>;
