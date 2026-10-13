import { z } from "zod";
import {
  providerCount,
  providerDate,
  providerHundredScore,
  providerTimestamp,
} from "@/shared/provider-observations";

const count = z.preprocess(
  providerCount,
  z.number().int().nonnegative().nullable(),
);
const score = z.preprocess(
  providerHundredScore,
  z.number().int().min(0).max(100).nullable(),
);
const timestamp = z.preprocess(providerTimestamp, z.string().nullable());

const backlinksRowSchema = z.object({
  domainFrom: z.string().nullable(),
  urlFrom: z.string().nullable(),
  urlTo: z.string().nullable(),
  anchor: z.string().nullable(),
  itemType: z.string().nullable(),
  isDofollow: z.boolean().nullable(),
  relAttributes: z.array(z.string()),
  rank: score,
  domainFromRank: score,
  pageFromRank: score,
  spamScore: score,
  firstSeen: timestamp,
  lastSeen: timestamp,
  isLost: z.boolean().nullable(),
  isBroken: z.boolean().nullable(),
  linksCount: count,
});

const referringDomainRowSchema = z.object({
  domain: z.string().nullable(),
  backlinks: count,
  referringPages: count,
  rank: score,
  spamScore: score,
  firstSeen: timestamp,
  brokenBacklinks: count,
  brokenPages: count,
});

const topPageRowSchema = z.object({
  page: z.string().nullable(),
  backlinks: count,
  referringDomains: count,
  rank: score,
  brokenBacklinks: count,
});

const anchorRowSchema = z.object({
  anchor: z.string().nullable(),
  backlinks: count,
  referringDomains: count,
  rank: score,
  spamScore: score,
  firstSeen: timestamp,
});

const linkBreakdownRowSchema = z.object({
  label: z.string(),
  value: count,
});
const linkBreakdownSchema = z
  .array(linkBreakdownRowSchema)
  .transform((rows) =>
    rows.flatMap((row) =>
      row.value !== null && row.value > 0
        ? [{ label: row.label, value: row.value }]
        : [],
    ),
  );

const backlinksTrendRowSchema = z.object({
  date: z.string(),
  backlinks: count,
  referringDomains: count,
  rank: score,
});

const backlinksNewLostTrendRowSchema = z.object({
  date: z.string(),
  newBacklinks: count,
  lostBacklinks: count,
  newReferringDomains: count,
  lostReferringDomains: count,
});

export const backlinksOverviewSchema = z
  .object({
    contractVersion: z.literal(2).optional(),
    target: z.string(),
    displayTarget: z.string(),
    scope: z.enum(["domain", "page"]),
    summary: z.object({
      rank: score,
      backlinks: count,
      referringPages: count,
      referringDomains: count,
      brokenBacklinks: count,
      brokenPages: count,
      backlinksSpamScore: score,
      targetSpamScore: score,
      newBacklinks: count,
      lostBacklinks: count,
      newReferringDomains: count,
      lostReferringDomains: count,
      /** Ranked label/count splits from the same summary call. Empty when
       *  DataForSEO didn't return them for this target. */
      referringCountries: linkBreakdownSchema.default([]),
      referringLinkTypes: linkBreakdownSchema.default([]),
      /** Referring-domain split by top-level domain (.com, .org, .edu…). */
      referringTlds: linkBreakdownSchema.default([]),
      /** rel attributes on the links — nofollow, ugc, sponsored, noopener. */
      referringLinkAttributes: linkBreakdownSchema.default([]),
      /** What kind of site links — blogs, cms, ecommerce, news. */
      referringPlatformTypes: linkBreakdownSchema.default([]),
      /** Where on the page the link sits — article, footer, sidebar. */
      referringPlacements: linkBreakdownSchema.default([]),
      /** Referring domains/pages carrying rel="nofollow". The dofollow share is
       *  the total minus these, so no extra call is needed for the split. */
      referringDomainsNofollow: count.default(null),
      referringPagesNofollow: count.default(null),
    }),
    trends: z.array(backlinksTrendRowSchema),
    newLostTrends: z.array(backlinksNewLostTrendRowSchema),
    fetchedAt: z.string(),
  })
  .transform((result) => ({
    ...result,
    trends: result.trends
      .filter((point) => providerDate(point.date) !== null)
      .map((point) => ({
        ...point,
        date: providerDate(point.date) ?? point.date,
      }))
      .toSorted((a, b) => a.date.localeCompare(b.date)),
    newLostTrends: result.newLostTrends
      .filter((point) => providerDate(point.date) !== null)
      .map((point) => ({
        ...point,
        date: providerDate(point.date) ?? point.date,
        ...(point.date < "2021-05-01"
          ? {
              newBacklinks: null,
              lostBacklinks: null,
              newReferringDomains: null,
              lostReferringDomains: null,
            }
          : {}),
      }))
      .toSorted((a, b) => a.date.localeCompare(b.date)),
  }));

export type BacklinksOverviewResult = z.infer<typeof backlinksOverviewSchema>;

/**
 * Exactly what the overview's cache object holds — the result nested under
 * `overview`, not the result itself.
 *
 * Exported rather than declared next to the writer so auto-restore validates a
 * stored payload against the same definition that wrote it; a hand-copied
 * shape on the reading side is free to drift.
 */
export const backlinksOverviewCacheSchema = z.object({
  overview: backlinksOverviewSchema,
});

function buildPageResultSchema<T extends z.ZodTypeAny>(rowSchema: T) {
  return z.object({
    contractVersion: z.literal(2).optional(),
    rows: z.array(rowSchema),
    totalCount: count,
    hasMore: z.boolean(),
    page: z.number(),
    pageSize: z.number(),
    fetchedAt: z.string(),
  });
}

export const backlinksRowsPageResultSchema =
  buildPageResultSchema(backlinksRowSchema);
export const referringDomainsPageResultSchema = buildPageResultSchema(
  referringDomainRowSchema,
);
export const topPagesPageResultSchema = buildPageResultSchema(topPageRowSchema);
export const anchorsPageResultSchema = buildPageResultSchema(anchorRowSchema);

export type BacklinksRowsPageResult = z.infer<
  typeof backlinksRowsPageResultSchema
>;
export type ReferringDomainsPageResult = z.infer<
  typeof referringDomainsPageResultSchema
>;
export type TopPagesPageResult = z.infer<typeof topPagesPageResultSchema>;
export type AnchorsPageResult = z.infer<typeof anchorsPageResultSchema>;
