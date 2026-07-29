import { z } from "zod";

/**
 * Shared shape for a metered run's PERSISTED geography (Defect 1 fix: a
 * restored run used to reconstruct its geography from a single bare
 * `locationCode` -- which cannot tell a metro/DMA code from a country code
 * apart -- and silently mislabeled a Dallas-Ft.-Worth run as an unnamed
 * "national" one. Every tab that can go local now captures the geo it
 * actually resolved at authorize()-time (never recomputed from the live
 * scope control -- see resolveRunGeo.ts's own header) and sends it to the
 * server purely so it lands in `analysis_runs.params_json`; a later
 * restore reads it back directly instead of reconstructing anything.
 *
 * Lives beside the other `types/schemas/*` request/response shapes (not
 * under `shared/geo/`) because, like `contentBriefSchema` and friends, both
 * the server (validating an incoming request, before persisting it
 * verbatim) and the client (validating a restored run's `paramsJson`) need
 * the exact same definition.
 */

/** Bump this when `storedMetricGeoSchema`'s shape changes incompatibly. A
 *  run recorded under a different version must be treated as having NO
 *  stored geo bundle at all -- see each feature's own `xGeoBundleSchema`,
 *  which pins this literal so a version mismatch fails validation
 *  outright rather than silently misreading an incompatible shape. */
export const STORED_GEO_BUNDLE_VERSION = 1;

/**
 * One metric's persisted geography. Carries every field a label needs --
 * including `parentCountryCode`, which a LOCAL metric's own `locationCode`
 * cannot itself reveal (a DMA code like 200623 isn't a row in any country
 * table) -- so a restore never has to guess which country a metro belongs
 * to in order to answer a country-only question (e.g. keyword difficulty)
 * for that same run.
 */
export const storedMetricGeoSchema = z.object({
  locationCode: z.number().int().positive(),
  parentCountryCode: z.number().int().positive(),
  languageCode: z.string().min(2).max(8),
  provider: z.enum(["labs", "google_ads", "serp", "business", "none"]),
  scope: z.enum(["local", "national"]),
  label: z.string(),
});
export type StoredMetricGeo = z.infer<typeof storedMetricGeoSchema>;
