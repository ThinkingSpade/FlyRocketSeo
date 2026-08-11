import { z } from "zod";
import { storedMetricGeoSchema, STORED_GEO_BUNDLE_VERSION } from "./geo";
import { errorCodeSchema } from "@/shared/error-codes";

/**
 * One run of the Keyword Trends tab's paid keyword discovery.
 *
 * A DISCRIMINATED UNION rather than a plain result, and that is the whole
 * point of this file. The tab auto-runs the paid call once per project and
 * then never again, and the only durable record of "we already tried" is the
 * analysis_runs row. If a FAILED attempt had nowhere to live, every mount for
 * a project with no credits (or against a vendor 5xx) would re-fire the call
 * forever -- and DataForSEO can charge for a task that then errors, so those
 * retries are not free. Storing the failure here makes "have we tried?" and
 * "what did we get?" the same question, answered by the one restore call the
 * tab already makes.
 */

const keywordDiscoveryKeywordSchema = z.object({
  keyword: z.string(),
  /** Labs `rank_absolute`: a point-in-time SERP position for `url`. NEVER
   *  merge this with Search Console's property-level average position. */
  position: z.number().nullable(),
  searchVolume: z.number().nullable(),
  traffic: z.number().nullable(),
  cpc: z.number().nullable(),
  url: z.string().nullable(),
  relativeUrl: z.string().nullable(),
  keywordDifficulty: z.number().nullable(),
});
export type KeywordDiscoveryKeyword = z.infer<
  typeof keywordDiscoveryKeywordSchema
>;

export const keywordDiscoveryResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    domain: z.string(),
    fetchedAt: z.string(),
    keywords: z.array(keywordDiscoveryKeywordSchema),
  }),
  z.object({
    status: z.literal("failed"),
    /** Short machine-ish tag, not a raw provider message: this is rendered. */
    reason: z.string(),
    /**
     * A server-diagnostic-only companion to `reason`: the `AppError.code`
     * behind this failure, or the fixed literal "unknown" for an error that
     * wasn't a recognised `AppError` at all. NEVER `error.message`, NEVER raw
     * provider text -- `reason` exists specifically because the raw
     * DataForSEO `status_message` can carry account identifiers (see
     * `describeFailure` in keywordDiscovery.ts), and that constraint applies
     * here just as much. The difference from `reason` is audience: `reason`
     * is the three-value tag the CLIENT renders; `diagnostic` is for a human
     * inspecting a stored run (e.g. via a D1/R2 admin query) who needs more
     * than "provider_error" to tell an out-of-funds account apart from a
     * malformed request or a vendor outage, without reaching for
     * `wrangler tail` output that may already have scrolled away.
     *
     * OPTIONAL so a `failed` row persisted before this field existed keeps
     * parsing -- this schema round-trips through R2/D1, so making it
     * required would break every already-stored failure the next time it's
     * read back.
     */
    diagnostic: z.union([errorCodeSchema, z.literal("unknown")]).optional(),
    attemptedAt: z.string(),
  }),
]);
export type KeywordDiscoveryResult = z.infer<
  typeof keywordDiscoveryResultSchema
>;

/**
 * The run's own persisted geography, read back by `parseStoredGeo` so a
 * restored table is labeled with the scope it was actually fetched under --
 * never with whatever the live ScopeControl happens to show now.
 */
export const keywordDiscoveryGeoBundleSchema = z.object({
  v: z.literal(STORED_GEO_BUNDLE_VERSION),
  rankings: storedMetricGeoSchema,
});
