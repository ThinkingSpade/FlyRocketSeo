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
 * says which it is — including, for the Labs-only needs, saying plainly that
 * the figure does not exist at all when the resolved country is one Labs
 * does not cover (`provider: "none"`), rather than naming a provider that
 * cannot serve it.
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
 * Labs is the sole source for the three NATIONAL_ONLY needs, and it only
 * covers the ~94 countries in LABS_LOCATION_OPTIONS. Reuses
 * getKeywordDataProvider rather than re-deriving Labs coverage a second way:
 * anything it does not call "labs" has no Labs data for this country, full
 * stop, so there is nothing left to serve difficulty/intent/domain-analytics
 * with.
 */
function nationalOnlyProvider(countryCode: number): "labs" | "none" {
  return getKeywordDataProvider(countryCode) === "labs" ? "labs" : "none";
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

/**
 * The country whose data actually answers `need`: the area's own parent
 * country when a target area is set, or the session's own country when
 * there is none. This holds even for an explicit country-kind area —
 * `filterCountryAreas` (geoLocationOptions.ts) sets `parentCountryCode` to
 * that country's own code — so every branch below can resolve "which
 * country" the same single way instead of re-deriving it per branch.
 */
function resolvedCountryCode(
  area: TargetArea | null,
  sessionLocationCode: number,
): number {
  return area?.parentCountryCode ?? sessionLocationCode;
}

/**
 * The language to pair with `resolvedCountryCode` in a DataForSEO request.
 * DataForSEO validates location+language pairs (schemas.ts's
 * assertLanguageForLocation) or worse, silently runs the wrong-language
 * query, so a figure resolved to a DIFFERENT country than the session's own
 * must use THAT country's configured language from LOCATION_OPTIONS — e.g. a
 * Paris target under a US/"en" session must query "fr", not "en". When the
 * resolved country IS the session's own, the session's language is kept
 * as-is rather than reset to LOCATION_OPTIONS' default: a project can
 * legitimately run its own country in a non-default language (e.g. US/"es"),
 * and that choice must survive resolution with no target area at all.
 */
function languageForCountry(
  countryCode: number,
  session: { locationCode: number; languageCode: string },
): string {
  if (countryCode === session.locationCode) return session.languageCode;
  return (
    LOCATION_OPTIONS.find((option) => option.code === countryCode)
      ?.languageCode ?? session.languageCode
  );
}

export function resolveGeo(
  need: GeoNeed,
  area: TargetArea | null,
  country: { locationCode: number; languageCode: string },
): ResolvedGeo {
  const countryCode = resolvedCountryCode(area, country.locationCode);
  const languageCode = languageForCountry(countryCode, country);

  const national = (label: string, provider: ResolvedGeo["provider"]) => ({
    locationCode: countryCode,
    languageCode,
    provider,
    scope: "national" as const,
    label,
  });

  if (need === "local-pack") {
    return {
      locationCode: area?.locationCode ?? country.locationCode,
      languageCode,
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
      nationalOnlyProvider(countryCode),
    );
  }

  const isSerpNeed = need === "serp" || need === "rank-tracking";

  if (area && isSubCountry(area)) {
    return {
      locationCode: area.locationCode,
      languageCode,
      provider: isSerpNeed ? "serp" : "google_ads",
      scope: "local",
      label: area.label,
    };
  }

  const locationCode = area?.locationCode ?? country.locationCode;
  return {
    locationCode,
    languageCode,
    provider: isSerpNeed ? "serp" : getKeywordDataProvider(locationCode),
    scope: "national",
    label: area?.label ?? countryLabelForCode(country.locationCode),
  };
}
