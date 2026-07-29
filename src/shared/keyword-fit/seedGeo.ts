import { wantsGeoModifiers, type ServiceAreaKind } from "./profileTypes";

/**
 * Whether and how a generated seed keyword carries a place name.
 *
 * This is the whole reason `serviceAreaKind` exists as a field. The same
 * business description produces different keywords depending on who can
 * actually buy: a DFW vending operator needs "office coffee service dallas",
 * because the national phrase describes demand they cannot serve, while a
 * worldwide SaaS needs that city stripped out as noise. Getting this backwards
 * is not a cosmetic problem -- it points the client's whole content plan at
 * the wrong audience.
 *
 * Kept pure and separate from the model call so the rule is testable without
 * one: the model proposes unmodified service phrases, and this decides what
 * geography (if any) they end up carrying.
 */

/**
 * Trims a target-area label down to the part a searcher would actually type.
 *
 * Seeded DataForSEO labels arrive as display names like "Dallas-Ft. Worth, TX"
 * or "Miami, Florida". Nobody searches "office coffee service dallas-ft.
 * worth, tx", so a metro's label is reduced to its first place name and a
 * city's to the city itself. The state/abbreviation half is dropped rather
 * than kept: it is the part real queries omit.
 */
export function toSearchablePlace(areaLabel: string): string {
  const firstSegment = areaLabel.split(",")[0]?.trim() ?? "";
  if (!firstSegment) return "";
  // "Dallas-Ft. Worth" -> "Dallas". A hyphenated metro names two cities; the
  // first is the one queries lead with.
  const leadCity = firstSegment.split("-")[0]?.trim() ?? firstSegment;
  return leadCity.toLowerCase();
}

/**
 * Applies the service-area rule to one batch of generated phrases.
 *
 * `national`/`global` return the phrases untouched. `local`/`regional` return
 * BOTH the modified and the bare phrase: the bare one still matters even for a
 * local business, because it is what the national head term looks like and
 * often carries the informational demand worth writing for. De-duplicated, and
 * order is stable so the caller can rely on it.
 */
export function applyServiceAreaToSeeds(
  phrases: readonly string[],
  serviceAreaKind: ServiceAreaKind,
  areaLabel: string | null,
): string[] {
  const cleaned = phrases
    .map((phrase) => phrase.trim().toLowerCase())
    .filter((phrase) => phrase !== "");

  const place = areaLabel ? toSearchablePlace(areaLabel) : "";
  if (!wantsGeoModifiers(serviceAreaKind) || !place) {
    return [...new Set(cleaned)];
  }

  const out: string[] = [];
  for (const phrase of cleaned) {
    // Never double up: a phrase the model already localized ("vending service
    // dallas") must not become "vending service dallas dallas".
    out.push(phrase.includes(place) ? phrase : `${phrase} ${place}`);
    if (!phrase.includes(place)) out.push(phrase);
  }
  return [...new Set(out)];
}
