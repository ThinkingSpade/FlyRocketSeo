import { z } from "zod";

export const citationTrackerRequestSchema = z.object({
  projectId: z.string().uuid(),
  businessName: z.string().trim().min(1).max(200),
  /** City (optionally "City, Region") -- combined client-side from the
   *  cached business profile before this request is sent. */
  city: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

const citationSerpResultSchema = z.object({
  domain: z.string().nullable(),
  url: z.string().nullable(),
  title: z.string().nullable(),
});

/** The Citation Tracker run exactly as it is cached -- shared so auto-restore
 *  validates against the same definition that wrote it (see serp.ts's
 *  serpOverviewSchema for the same pattern). Deliberately raw SERP results,
 *  not a found/missing verdict: citationModel.ts recomputes that from these
 *  on every render, the same way SerpOverviewPage recomputes its verdict
 *  from a cached/restored result rather than storing the verdict itself. */
export const citationTrackerResultSchema = z
  .object({
    query: z.string(),
    businessName: z.string(),
    city: z.string().nullable(),
    phone: z.string().nullable(),
    locationCode: z.number(),
    languageCode: z.string(),
    results: z.array(citationSerpResultSchema),
    fetchedAt: z.string(),
    contractVersion: z.literal(2).optional(),
    source: z.literal("DataForSEO Google Organic SERP").optional(),
    scope: z
      .object({
        organizationId: z.string(),
        projectId: z.string(),
        query: z.string(),
        businessName: z.string(),
        city: z.string().nullable(),
        phone: z.string().nullable(),
        locationCode: z.number().int().positive(),
        languageCode: z.string(),
      })
      .optional(),
  })
  .superRefine((result, context) => {
    if (result.contractVersion !== 2) return;
    const { scope } = result;
    if (
      !scope ||
      !result.source ||
      scope.query !== result.query ||
      scope.businessName !== result.businessName ||
      scope.city !== result.city ||
      scope.phone !== result.phone ||
      scope.locationCode !== result.locationCode ||
      scope.languageCode !== result.languageCode
    ) {
      context.addIssue({
        code: "custom",
        message: "Citation capture disagrees with its original scope.",
      });
    }
  });
