import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getGeoLocationSeedStatus,
  seedGeoLocationsChunk,
} from "@/serverFunctions/geo";

const DATAFORSEO_LOCATIONS_DOCS_URL =
  "https://docs.dataforseo.com/v3/keywords_data/google_ads/locations/";

type SeedProgress = { writtenSoFar: number; totalRows: number };

/**
 * Operator setup action: seeds `geo_locations` (countries, states, metros
 * and cities) from DataForSEO's Google Ads locations list, so the geo
 * picker's city/metro search (`GeoLocationSelect.tsx`, via
 * `searchGeoLocations`) has data to search at all. Needed on every
 * deployment — hosted or self-hosted — until run at least once; see
 * `scripts/seed-geo-locations.ts`'s own header for why no free,
 * no-credential bulk export can supply this instead.
 *
 * Lives in Settings, not the picker's own empty state: this triggers a real
 * external fetch plus a bulk rewrite of the table, meant for whoever
 * operates this deployment — not something a normal user browsing the
 * picker should be able to set off by accident.
 * `GeoLocationRepository.ts` (the picker's read path) is explicitly
 * documented to never reach a metered provider; keeping the one action that
 * can well away from that component is what keeps that invariant legible,
 * not just true. There is no separate admin/operator role in this app to
 * gate on server-side (`seedGeoLocationsChunk` uses the same
 * `requireAuthenticatedContext` every other shared-reference-data server
 * function does) — this placement and framing IS the "operator action"
 * signal.
 *
 * Explicitly triggered only: nothing here runs on render or on mount beyond
 * the free status read. The confirm step loops `seedGeoLocationsChunk`
 * client-side — one bounded Worker invocation per call, same shape
 * `AnalyzeProjectCard.tsx` already uses for its own sequence of analyses —
 * until the whole list is written, showing the real written/total counts at
 * every step rather than a fabricated percentage.
 */
export function GeoLocationSeedSection() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["geoLocationSeedStatus"],
    queryFn: () => getGeoLocationSeedStatus(),
  });

  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Resume cursor, kept outside React state: a retry reads it synchronously
  // (no stale-closure risk) rather than waiting on a render round trip.
  const offsetRef = useRef(0);

  async function runFrom(startOffset: number) {
    setConfirming(false);
    setRunning(true);
    setError(null);
    offsetRef.current = startOffset;

    try {
      let done = false;
      while (!done) {
        const result = await seedGeoLocationsChunk({
          data: { offset: offsetRef.current },
        });
        offsetRef.current = result.writtenSoFar;
        setProgress({
          writtenSoFar: result.writtenSoFar,
          totalRows: result.totalRows,
        });
        done = result.done;
      }
      toast.success(`Seeded ${offsetRef.current.toLocaleString()} locations.`);
      await queryClient.invalidateQueries({
        queryKey: ["geoLocationSeedStatus"],
      });
    } catch (thrown) {
      setError(getStandardErrorMessage(thrown, "Seeding failed"));
      toast.error("Location seeding failed — see Settings for details.");
    } finally {
      setRunning(false);
    }
  }

  const rowCount = statusQuery.data?.rowCount ?? null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">
        Location data
      </h2>
      <div className="space-y-3 text-sm">
        <p className="text-base-content/70">
          {rowCount === null
            ? "Checking whether this deployment's location data is seeded…"
            : rowCount === 0
              ? "Not seeded yet — the location picker's city and metro search will return nothing until this runs once."
              : `${rowCount.toLocaleString()} locations seeded.`}
        </p>

        {!confirming && !running ? (
          <button
            type="button"
            className="btn btn-sm btn-outline w-fit gap-2"
            onClick={() => setConfirming(true)}
          >
            <MapPin className="size-4" />
            {rowCount !== null && rowCount > 0
              ? "Re-seed location data"
              : "Seed location data"}
          </button>
        ) : null}

        {confirming ? (
          <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <p className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                Free — DataForSEO documents this endpoint as not charged
                (&quot;Your account will not be charged for using this
                API&quot;,{" "}
                <a
                  href={DATAFORSEO_LOCATIONS_DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="link"
                >
                  their docs
                </a>
                ). Still a bulk operation: it fetches Google&apos;s full
                worldwide location list (countries, states, metros and cities)
                and writes it in chunks, replacing any existing rows. Takes a
                few minutes.
              </span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void runFrom(0)}
              >
                Yes, seed now
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {running || progress ? (
          <p className="flex items-center gap-2 text-xs text-base-content/60">
            {running ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
            ) : null}
            {progress
              ? `${progress.writtenSoFar.toLocaleString()} of ${progress.totalRows.toLocaleString()} written${running ? "…" : "."}`
              : "Starting…"}
          </p>
        ) : null}

        {error ? (
          <div className="space-y-2 rounded-lg border border-error/40 bg-error/10 p-3">
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => void runFrom(offsetRef.current)}
            >
              Retry from where it stopped
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
