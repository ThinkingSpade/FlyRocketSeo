import { z } from "zod";

/** `?range=` on the report page; anything unrecognized falls back to 30d. */
export const reportSearchSchema = z.object({
  range: z.enum(["30d", "90d"]).optional().catch(undefined),
});

// ---------------------------------------------------------------------------
// White-label branding
// ---------------------------------------------------------------------------

const brandTextField = z
  .string()
  .trim()
  .max(80)
  .transform((value) => value || undefined)
  .optional();

// Small raster data URI. SVG is deliberately excluded (scriptable format), and
// the length cap (~128KB of image) keeps a logo from bloating every share row.
const logoDataUriField = z
  .string()
  .regex(
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/,
    "Logo must be a PNG, JPEG, or WebP image",
  )
  .max(180_000, "Logo image must be under ~128KB");

export const getReportBrandingSchema = z.object({
  projectId: z.string().min(1),
});

/** Full-replace semantics: the editor always submits every field, so an
 * omitted/empty value clears the stored one. */
export const updateReportBrandingSchema = z.object({
  projectId: z.string().min(1),
  brandName: brandTextField,
  preparedBy: brandTextField,
  logoDataUri: logoDataUriField.nullish(),
});

// ---------------------------------------------------------------------------
// Public share snapshots
// ---------------------------------------------------------------------------
// The public page renders EXACTLY what is stored here — validated and bounded
// at creation so a share can never grow into an unbounded or malformed blob.

const nullableNumber = z.number().finite().nullable();
const countField = z.number().int().min(0).max(1_000_000);

const shareMoverSchema = z.object({
  keyword: z.string().max(200),
  searchVolume: nullableNumber,
  previousPosition: nullableNumber,
  currentPosition: nullableNumber,
  delta: nullableNumber,
});

const shareMoversSchema = z.object({
  improved: z.array(shareMoverSchema).max(10),
  declined: z.array(shareMoverSchema).max(10),
  improvedTotal: countField,
  declinedTotal: countField,
});

const shareChartPointSchema = z.object({
  checkedAt: z.number().finite(),
  top3: z.number().finite(),
  top4to10: z.number().finite(),
  top11to20: z.number().finite(),
  notRanking: z.number().finite(),
});

const shareMarkerSchema = z.object({
  id: z.string().max(64),
  ts: z.number().finite(),
  eventDate: z.string().max(10),
  title: z.string().max(120),
});

const shareRankBlockSchema = z.object({
  domain: z.string().max(255),
  device: z.enum(["desktop", "mobile"]),
  keywordCount: countField,
  visibility: nullableNumber,
  visibilityDelta: nullableNumber,
  ranking: countField,
  rankingDelta: z.number().int(),
  top3: countField,
  top10: countField,
  improved: countField,
  declined: countField,
  avgPosition: nullableNumber,
  avgPositionPrevious: nullableNumber,
  movers: shareMoversSchema,
  chartData: z.array(shareChartPointSchema).max(120),
  eventMarkers: z.array(shareMarkerSchema).max(50),
});

const shareEventSchema = z.object({
  id: z.string().max(64),
  eventDate: z.string().max(10),
  title: z.string().max(120),
  note: z.string().max(1000).nullable(),
});

const shareLighthouseAveragesSchema = z.object({
  performance: nullableNumber,
  accessibility: nullableNumber,
  bestPractices: nullableNumber,
  seo: nullableNumber,
  sampleSize: countField,
});

const shareAuditHealthSchema = z.object({
  pagesCrawled: countField,
  okPages: countField,
  redirectPages: countField,
  brokenPages: countField,
  indexablePages: countField,
  missingTitle: countField,
  missingDescription: countField,
  missingH1: countField,
  thinContent: countField,
  imagesMissingAlt: countField,
  lighthouse: z.object({
    mobile: shareLighthouseAveragesSchema,
    desktop: shareLighthouseAveragesSchema,
  }),
});

const shareGscSchema = z.object({
  clicks: z.number().finite(),
  impressions: z.number().finite(),
  ctr: z.number().finite(),
  position: z.number().finite(),
  prevClicks: z.number().finite(),
  prevImpressions: z.number().finite(),
});

const shareBrandingSchema = z.object({
  brandName: z.string().max(80).nullable(),
  preparedBy: z.string().max(80).nullable(),
  logoDataUri: logoDataUriField.nullable(),
});

export const reportShareSnapshotSchema = z.object({
  projectTitle: z.string().max(255),
  rangeLabel: z.string().max(40),
  generatedAt: z.string().max(40),
  rankBlocks: z.array(shareRankBlockSchema).max(4),
  events: z.array(shareEventSchema).max(100),
  audit: z
    .object({
      completedAt: z.string().max(40).nullable(),
      startUrl: z.string().max(500),
      health: shareAuditHealthSchema,
    })
    .nullable(),
  gsc: shareGscSchema.nullable(),
  branding: shareBrandingSchema.nullable(),
});

export type ReportShareSnapshot = z.infer<typeof reportShareSnapshotSchema>;

export const createReportShareSchema = z.object({
  projectId: z.string().min(1),
  rangeKey: z.enum(["30d", "90d"]),
  title: z.string().trim().min(1).max(160),
  snapshot: reportShareSnapshotSchema,
});

export const listReportSharesSchema = z.object({
  projectId: z.string().min(1),
});

export const revokeReportShareSchema = z.object({
  projectId: z.string().min(1),
  shareId: z.string().min(1),
});
