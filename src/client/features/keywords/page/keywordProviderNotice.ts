/**
 * What KeywordResearchSearchBar.tsx's provider notice should say, given the
 * geo THIS run will actually use if submitted right now (resolveRunGeo's
 * "keyword-volume" result for the live country control + confirmed target
 * area). Split into its own `.ts` module -- rather than left as an inline
 * ternary -- so the actual decision (Gap 2 of the geo-honesty pass: a
 * metro-scoped run silently advertised Labs clickstream data it can never
 * return) has a real regression test; this repo's Vitest collects only
 * `src/**\/*.test.ts` under `environment: "node"`, so logic worth pinning
 * has to live outside the `.tsx` file that renders it.
 *
 * Google Ads never returns keyword difficulty or search intent, whether
 * that is because the whole session country lacks DataForSEO Labs coverage
 * (e.g. Iceland) or because a confirmed metro/city scope routed this
 * specific run to Google Ads instead. Those two cases need DIFFERENT copy:
 * only the second has a "pick a different area" escape hatch worth naming,
 * so `google-ads-local` carries the area's own label and
 * `google-ads-national` does not.
 */
import { getKeywordDataProvider } from "@/shared/keyword-locations";
import type { ResolvedGeo } from "@/shared/geo/types";

// Not exported: the one caller (KeywordResearchSearchBar.tsx) and this
// file's own test read it off `resolveKeywordProviderNotice`'s return
// value rather than importing the type directly -- knip flags an unused
// export otherwise (same reasoning useKeywordResearchController.ts's own
// private geo-bundle type gives).
type KeywordProviderNotice =
  | { kind: "labs" }
  | { kind: "google-ads-local"; areaLabel: string }
  | { kind: "google-ads-national" };

/**
 * `volumeGeo` must be `resolveRunGeo("keyword-volume", ...)` for the geo
 * that WILL be sent -- never a bare check against the country control alone
 * (that was the actual bug: it ignored a confirmed metro scope entirely).
 */
export function resolveKeywordProviderNotice(
  volumeGeo: Pick<ResolvedGeo, "locationCode" | "scope" | "label">,
): KeywordProviderNotice {
  if (getKeywordDataProvider(volumeGeo.locationCode) === "labs") {
    return { kind: "labs" };
  }
  return volumeGeo.scope === "local"
    ? { kind: "google-ads-local", areaLabel: volumeGeo.label }
    : { kind: "google-ads-national" };
}
