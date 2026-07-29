import { Gauge } from "lucide-react";

type Props = {
  /** How many keywords this click would fetch difficulty for -- always the
   *  count actually bounded into the request (e.g. the current page), never
   *  the full result set, so the copy never promises more than one click
   *  will fetch. */
  count: number;
  /** From `describeGeoUnavailable` -- set when resolveGeo already knows this
   *  figure cannot be produced at all (provider: "none"). Renders instead of
   *  a button that would only fail if clicked. */
  unavailableMessage: string | null;
  isLoading: boolean;
  isError: boolean;
  /** Once a load has completed, the affordance steps aside -- the fetched
   *  values are already merged into the rows above it. */
  loaded: boolean;
  onLoad: () => void;
};

/**
 * Task 6 Step 3's on-demand difficulty affordance, shared by Keyword
 * Research and SERP Overview. Difficulty/intent are Labs-only (country
 * level) -- see `resolveGeo.ts`'s NATIONAL_ONLY set -- so a metro-scoped run
 * never fetches them automatically; this is the explicit, single click that
 * does, bounded to the keywords already on screen.
 *
 * Bare muted icon + text per this app's icon rule -- no chip, no badge, no
 * colored pill.
 */
export function DifficultyOverviewControl({
  count,
  unavailableMessage,
  isLoading,
  isError,
  loaded,
  onLoad,
}: Props) {
  if (unavailableMessage) {
    return <p className="text-xs text-base-content/50">{unavailableMessage}</p>;
  }

  if (loaded) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        className="btn btn-ghost btn-xs gap-1.5 text-base-content/60"
        onClick={onLoad}
        disabled={isLoading}
      >
        {isLoading ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <Gauge className="size-3.5" />
        )}
        Load difficulty for these {count}
      </button>
      {isError ? (
        <span className="text-error">Couldn&rsquo;t load difficulty.</span>
      ) : null}
    </div>
  );
}
