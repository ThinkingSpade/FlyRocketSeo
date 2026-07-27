import {
  getKeywordDataProvider,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";
import type { GeoNeed, ResolvedGeo, TargetArea } from "./types";

/**
 * Decides which geography and provider answer a given question.
 *
 * Pure and total. The asymmetry it encodes is not arbitrary: DataForSEO Labs
 * carries keyword difficulty and search intent but only at country level,
 * while the Google Ads endpoints cover metros but carry neither. So a local
 * project reads volume locally and difficulty nationally, and every result
 * says which it is.
 */

/** Needs that only exist at country level, whatever the target area. */
const NATIONAL_ONLY: ReadonlySet<GeoNeed> = new Set([
  "keyword-difficulty",
  "search-intent",
  "domain-analytics",
]);

function isSubCountry(area: TargetArea): boolean {
  return area.kind !== "country";
}

/**
 * A national-scope result needs the country's NAME (e.g. "United States"),
 * not the sub-country area's own label (e.g. "Dallas-Fort Worth TX"). Rather
 * than keep a second country table, look it up in LOCATION_OPTIONS — the
 * single source of truth for location metadata already used to pick data
 * providers.
 */
function countryLabel(area: TargetArea): string {
  return (
    LOCATION_OPTIONS.find((option) => option.code === area.parentCountryCode)
      ?.label ?? ""
  );
}

export function resolveGeo(
  need: GeoNeed,
  area: TargetArea | null,
  country: { locationCode: number; languageCode: string },
): ResolvedGeo {
  const national = (label: string, provider: ResolvedGeo["provider"]) => ({
    locationCode: area?.parentCountryCode ?? country.locationCode,
    languageCode: country.languageCode,
    provider,
    scope: "national" as const,
    label,
  });

  if (need === "local-pack") {
    return {
      locationCode: area?.locationCode ?? country.locationCode,
      languageCode: country.languageCode,
      provider: "business",
      scope: area && isSubCountry(area) ? "local" : "national",
      label: area?.label ?? "United States",
    };
  }

  if (NATIONAL_ONLY.has(need)) {
    return national(
      area && isSubCountry(area) ? countryLabel(area) : (area?.label ?? ""),
      "labs",
    );
  }

  const isSerpNeed = need === "serp" || need === "rank-tracking";

  if (area && isSubCountry(area)) {
    return {
      locationCode: area.locationCode,
      languageCode: country.languageCode,
      provider: isSerpNeed ? "serp" : "google_ads",
      scope: "local",
      label: area.label,
    };
  }

  const locationCode = area?.locationCode ?? country.locationCode;
  return {
    locationCode,
    languageCode: country.languageCode,
    provider: isSerpNeed ? "serp" : getKeywordDataProvider(locationCode),
    scope: "national",
    label: area?.label ?? "",
  };
}
