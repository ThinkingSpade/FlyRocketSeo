/**
 * Which geography answers which question.
 *
 * Splitting by NEED rather than by project is the whole point: a local
 * business wants local search volume, but keyword difficulty only exists at
 * country level, so one project legitimately reads from two geographies at
 * once. Every resolved value therefore carries the scope it describes, so the
 * UI can label it rather than implying one number means both.
 */

export type GeoNeed =
  | "keyword-volume"
  | "keyword-difficulty"
  | "search-intent"
  | "serp"
  | "rank-tracking"
  | "domain-analytics"
  | "local-pack";

export type GeoScope = "local" | "national";

export type TargetAreaKind = "metro" | "city" | "region" | "country";

export type TargetArea = {
  kind: TargetAreaKind;
  locationCode: number;
  label: string;
  parentCountryCode: number;
};

export type ResolvedGeo = {
  locationCode: number;
  languageCode: string;
  /**
   * "none" means no provider can serve this need for this geography at all
   * — not a fetch that might fail, but a figure that does not exist. Only
   * reachable for the three Labs-only needs (difficulty, intent, domain
   * analytics) when the resolved country is Google-Ads-only (e.g. Iceland):
   * Labs is the sole source for those three and simply has no data there,
   * unlike keyword-volume/SERP, which Google Ads/the SERP API still cover.
   * Callers must treat this as "does not exist here", not retry or blame a
   * transient error.
   */
  provider: "labs" | "google_ads" | "serp" | "business" | "none";
  /** What the resulting figure actually describes. Drives the UI label. */
  scope: GeoScope;
  /** Human label for that geography, e.g. "Dallas-Fort Worth TX". */
  label: string;
};
