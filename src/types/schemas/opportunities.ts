import { z } from "zod";
import { GSC_DEVICES } from "./search-performance";
import {
  investigationScopeShape,
  pageInvestigationInputSchema,
} from "./page-investigation";

export const opportunityStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "implemented",
  "results_pending",
  "measured",
  "dismissed",
]);
export const opportunityProjectInputSchema = z.object({
  projectId: z.string().min(1),
});
export const opportunityHistoryInputSchema =
  opportunityProjectInputSchema.extend({
    opportunityId: z.string().min(1),
    beforeRevision: z.number().int().positive().optional(),
  });
const windowSchema = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
});
const observationSchema = z.object({
  clicks: z.number().finite().nonnegative(),
  impressions: z.number().finite().nonnegative(),
  position: z.number().finite().positive().nullable(),
});
export const evidenceSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.enum([
    "Google Search Console",
    "Google Search Console and captured HTML",
  ]),
  fetchedAt: z.iso.datetime({ offset: true }),
  scope: z.object({
    organizationId: z.string().min(1),
    projectId: z.string().min(1),
    target: z.string().min(1),
    siteUrl: z.string().min(1),
    connectedBy: z.string().nullable(),
    country: z.string().nullable(),
    device: z.enum(GSC_DEVICES).nullable(),
    searchType: z.enum(["web", "image", "video", "news"]),
  }),
  url: z.string().url(),
  window: windowSchema,
  previousWindow: windowSchema,
  current: observationSchema,
  previous: observationSchema,
  coverage: z.object({
    finalData: z.boolean(),
    currentRows: z.number().int().nonnegative(),
    previousRows: z.number().int().nonnegative(),
    truncated: z.boolean(),
    complete: z.boolean(),
  }),
  limitations: z.array(z.string()),
  link: z
    .object({
      sourceUrl: z.string().url(),
      destinationUrl: z.string().url(),
      anchor: z.string(),
      sourceLocation: z.string(),
      sourceExcerpt: z.string(),
      capturedAt: z.string(),
    })
    .optional(),
});
export const opportunityFindingSchema = z.object({
  kind: z.enum(["page_decline", "page_review", "internal_link"]),
  title: z.string(),
  finding: z.string(),
  url: z.string().url(),
  assetRefs: z.array(z.string().url()),
  priorityBand: z.enum(["high", "medium", "low"]),
  confidenceBand: z.enum(["high", "medium", "low"]),
  limitations: z.array(z.string()),
  nextSteps: z.array(z.string()),
  evidence: evidenceSnapshotSchema,
});
export const opportunityResultSchema = z.object({
  availability: z.enum(["measured", "insufficient", "incomparable"]),
  measuredAt: z.iso.datetime({ offset: true }),
  baseline: evidenceSnapshotSchema,
  after: evidenceSnapshotSchema,
  clicksChange: z.number().nullable(),
  impressionsChange: z.number().nullable(),
  limitations: z.array(z.string()),
});
export const refreshOpportunitiesInputSchema = z
  .object({ projectId: z.string().min(1), ...investigationScopeShape })
  .superRefine((value, context) => {
    if (Boolean(value.startDate) !== Boolean(value.endDate))
      context.addIssue({ code: "custom", message: "Choose both dates" });
    if (value.startDate && value.endDate) {
      const days =
        (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000 +
        1;
      if (days < 1 || days > 93)
        context.addIssue({
          code: "custom",
          message: "Choose an ordered window of up to 93 days",
        });
    }
  });
export const savePageOpportunityInputSchema =
  pageInvestigationInputSchema.safeExtend({
    kind: z.literal("page_review").optional(),
  });
export const updateOpportunityInputSchema = z
  .object({
    projectId: z.string().min(1),
    opportunityId: z.string().min(1),
    expectedRevision: z.number().int().positive(),
    status: opportunityStatusSchema.optional(),
    assigneeUserId: z.string().min(1).nullable().optional(),
    note: z.string().trim().min(1).max(4000).optional(),
    implementedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.assigneeUserId !== undefined ||
      value.note !== undefined,
    { message: "Choose a change or add a note" },
  );
export const measureOpportunityInputSchema = z
  .object({
    projectId: z.string().min(1),
    opportunityId: z.string().min(1),
    expectedRevision: z.number().int().positive(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  })
  .refine(
    (value) => {
      const days =
        (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000 +
        1;
      return days > 0 && days <= 93;
    },
    { message: "Choose an ordered measurement window of up to 93 days" },
  );
export const saveInternalLinkOpportunityInputSchema =
  refreshOpportunitiesInputSchema.safeExtend({
    sourceUrl: z.string().url().max(2048),
    targetUrl: z.string().url().max(2048),
    phrase: z.string().trim().min(1).max(200),
  });
export type RefreshOpportunitiesInput = z.infer<
  typeof refreshOpportunitiesInputSchema
>;
export type SavePageOpportunityInput = z.infer<
  typeof savePageOpportunityInputSchema
>;
export type UpdateOpportunityInput = z.infer<
  typeof updateOpportunityInputSchema
>;
export type MeasureOpportunityInput = z.infer<
  typeof measureOpportunityInputSchema
>;
export type SaveInternalLinkOpportunityInput = z.infer<
  typeof saveInternalLinkOpportunityInputSchema
>;
