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
 * Country name for a DataForSEO country location code, read from
 * LOCATION_OPTIONS — the single source of truth for location metadata
 * already used to pick data providers, so we don't keep a second country
 * table. Two callers need this: a national-scope result under a sub-country
 * area (which needs the country's NAME, e.g. "United States", not the
 * area's own label, e.g. "Dallas-Fort Worth TX"), and any need with no
 * target area at all, where the label is simply the session country's own
 * name — never a different, hardcoded country.
 *
 * The `?? ""` here is the one place an empty label is correct rather than a
 * bug: if the code isn't in LOCATION_OPTIONS, there is no truthful name to
 * show, and every caller below already has nothing better to fall back to.
 */
function countryLabelForCode(locationCode: number): string {
  return (
    LOCATION_OPTIONS.find((option) => option.code === locationCode)?.label ?? ""
  );
}

function countryLabel(area: TargetArea): string {
  return countryLabelForCode(area.parentCountryCode);
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
      // No target area means this figure describes the whole session
      // country; say so by its own name, not an assumed default.
      label: area?.label ?? countryLabelForCode(country.locationCode),
    };
  }

  if (NATIONAL_ONLY.has(need)) {
    return national(
      area && isSubCountry(area)
        ? countryLabel(area)
        : (area?.label ?? countryLabelForCode(country.locationCode)),
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
    label: area?.label ?? countryLabelForCode(country.locationCode),
  };
}
