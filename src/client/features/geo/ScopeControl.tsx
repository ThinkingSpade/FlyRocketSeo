import { MapPin, X } from "lucide-react";
import { GeoLocationSelect } from "@/client/features/geo/GeoLocationSelect";
import type { TargetArea } from "@/shared/geo/types";

type Props = {
  /** The tab's currently active area -- never null: before anything is ever
   *  confirmed this is the project's own country (see
   *  `resolveScopeArea.ts`'s `resolveDefaultScopeArea`), which is exactly
   *  what already answers every query today. */
  area: TargetArea;
  onChange: (area: TargetArea) => void;
  /** Gates the "Clear" affordance -- omit (or false) when there is nothing
   *  confirmed to revert, e.g. for the plain country fallback. */
  hasConfirmedArea?: boolean;
  /** Reverts to the country fallback. Required together with
   *  `hasConfirmedArea` -- the button renders only when both are given. */
  onClear?: () => void;
  className?: string;
};

/**
 * The one-per-tab "which geography is this tab scoped to" control -- the
 * design spec's own "switcher" -- placed in each of the six affected tabs'
 * headers (Keyword Research, Keyword Trends, SERP Overview, Content
 * Optimizer, Rank Tracking, Topic Clusters). Shows the active area and opens
 * the same `GeoLocationSelect` picker `TargetAreaBanner`'s "Not right?" uses
 * to change it, plus an optional "Clear" affordance back to the country
 * fallback (the only way to reach "nothing confirmed" again once an area
 * has been accepted or manually set).
 *
 * ONE control per tab, not per input field -- this must never be rendered
 * more than once per page. It intentionally shares `GeoLocationSelect`
 * wholesale rather than a second picker implementation.
 */
export function ScopeControl({
  area,
  onChange,
  hasConfirmedArea = false,
  onClear,
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
      {hasConfirmedArea && onClear ? (
        <button
          type="button"
          aria-label="Clear target area"
          title="Reset to national"
          className="btn btn-ghost btn-xs btn-square text-base-content/40"
          onClick={onClear}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
