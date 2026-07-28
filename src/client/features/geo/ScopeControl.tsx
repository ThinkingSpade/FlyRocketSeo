import { MapPin } from "lucide-react";
import { GeoLocationSelect } from "@/client/features/geo/GeoLocationSelect";
import type { TargetArea } from "@/shared/geo/types";

type Props = {
  /** The tab's currently active area -- never null: before anything is ever
   *  confirmed this is the project's own country (see
   *  `scopeControl.ts`'s `resolveDefaultScopeArea`), which is exactly what
   *  already answers every query today. */
  area: TargetArea;
  onChange: (area: TargetArea) => void;
  className?: string;
};

/**
 * The one-per-tab "which geography is this tab scoped to" control -- the
 * design spec's own "switcher" -- placed in each of the six affected tabs'
 * headers (Keyword Research, Keyword Trends, SERP Overview, Content
 * Optimizer, Rank Tracking, Topic Clusters). Shows the active area and opens
 * the same `GeoLocationSelect` picker `TargetAreaBanner`'s "Not right?" uses
 * to change it.
 *
 * ONE control per tab, not per input field -- this must never be rendered
 * more than once per page. It intentionally shares `GeoLocationSelect`
 * wholesale rather than a second picker implementation.
 */
export function ScopeControl({
  area,
  onChange,
  className = "w-44 sm:w-56",
}: Props) {
  return (
    <div className="flex items-center gap-1.5">
      <MapPin className="size-4 shrink-0 text-base-content/40" />
      <GeoLocationSelect
        value={area}
        onChange={onChange}
        className={className}
      />
    </div>
  );
}
