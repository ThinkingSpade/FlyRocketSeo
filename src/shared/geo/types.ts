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
  provider: "labs" | "google_ads" | "serp" | "business";
  /** What the resulting figure actually describes. Drives the UI label. */
  scope: GeoScope;
  /** Human label for that geography, e.g. "Dallas-Fort Worth TX". */
  label: string;
};
