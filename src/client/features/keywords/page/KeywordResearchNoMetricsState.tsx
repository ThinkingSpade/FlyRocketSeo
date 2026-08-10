import { MapPinOff } from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";
import { countryLabelForCode } from "@/shared/geo/resolveGeo";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
  rowCount: number;
  /** Drops the confirmed area, puts the country half back to the project's
   *  own country, and re-runs. Owned by the page, which holds both halves
   *  `resolveRunGeo` reconciles — the controller can see the area but cannot
   *  clear it. */
  onSearchCountry: () => void;
};

/**
 * Shown when a run finished and returned rows, but not one of them carries a
 * single figure (see keywordResultUsability.ts).
 *
 * This state did not exist before. The tab had "rows" and "no rows", so a run
 * that came back with the seed keyword alone — every metric null — fell into
 * the "rows" branch and rendered as a table of dashes under a "Showing 1
 * keywords · 0 total vol" header, with nothing anywhere saying the vendor had
 * no data. It read as a broken page rather than an answer.
 *
 * The cause is almost always geographic, so the recovery offered is
 * geographic: a sub-country scope routes the run to Google Ads, whose Keyword
 * Planner has no figures for most long-tail phrases at state/metro
 * granularity. Re-running against the country typically returns real volume,
 * plus the difficulty and intent that Google Ads cannot supply at all.
 */
export function KeywordResearchNoMetricsState({
  controller,
  rowCount,
  onSearchCountry,
}: Props) {
  const { researchGeo, searchedKeyword } = controller;
  // Only the CAPTURED run's geo, never the live scope control — this describes
  // the rows actually on screen, so a since-changed picker must not relabel it.
  const wentLocal = researchGeo?.volume.scope === "local";
  const areaLabel = researchGeo?.volume.label ?? "this area";
  // `difficulty` rather than `volume`: for a local run the volume half holds
  // the state/metro code, while the difficulty half is always resolved to the
  // parent COUNTRY (resolveGeo's NATIONAL_ONLY branch) — which is exactly the
  // geography the button below would re-run against.
  const countryLabel =
    (researchGeo && countryLabelForCode(researchGeo.difficulty.locationCode)) ||
    "the whole country";

  return (
    <div className="pt-1">
      <div className="mx-auto w-full max-w-2xl space-y-4 rounded-2xl border border-base-300 bg-base-100 p-6 text-center md:p-8">
        <MapPinOff className="mx-auto size-10 text-base-content/40" />
        <div className="space-y-2">
          <p className="text-lg font-semibold text-base-content">
            {wentLocal
              ? `Google has no keyword data for ${areaLabel}`
              : "Google has no keyword data for this search"}
          </p>
          <p className="text-sm text-base-content/70">
            {wentLocal ? (
              <>
                We got {rowCount === 1 ? "one keyword" : `${rowCount} keywords`}{" "}
                back for{" "}
                <span className="font-medium text-base-content">
                  “{searchedKeyword}”
                </span>
                , but no search volume, CPC or trend for any of them. Google
                reports figures for far fewer phrases at {areaLabel} scale than
                it does nationally, and it never reports difficulty or intent
                below country level at all.
              </>
            ) : (
              <>
                We got {rowCount === 1 ? "one keyword" : `${rowCount} keywords`}{" "}
                back for{" "}
                <span className="font-medium text-base-content">
                  “{searchedKeyword}”
                </span>
                , but no search volume, CPC or trend for any of them. This
                phrase may be too specific for Google to report on — try a
                shorter, broader version of it.
              </>
            )}
          </p>
        </div>
        {wentLocal ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onSearchCountry}
          >
            Search {countryLabel} instead
          </Button>
        ) : null}
      </div>
    </div>
  );
}
