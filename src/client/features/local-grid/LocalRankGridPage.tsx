import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Grid3x3, LocateFixed, Search } from "lucide-react";
import {
  geocodeLocation,
  getLocalGridCell,
} from "@/serverFunctions/local-grid";
import {
  buildGrid,
  roundCoord,
  type GridPoint,
} from "@/client/features/local-grid/gridGeo";
import {
  RankGridMap,
  type CellState,
} from "@/client/features/local-grid/RankGridMap";
import { computeGridShareOfVoice } from "@/client/features/local-grid/gridShareOfVoice";

type LocalGridNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

const DEFAULT_CENTER: GridPoint = { lat: 32.7767, lng: -96.797 };
const RADIUS_OPTIONS = [1, 2, 5, 10] as const;
const GRID_OPTIONS = [3, 5, 7] as const;

export function LocalRankGridPage({
  projectId,
  navigate,
  query,
  lat,
  lng,
  radius,
  gridSize,
}: {
  projectId: string;
  navigate: LocalGridNavigate;
  query: string;
  lat: number | undefined;
  lng: number | undefined;
  radius: number | undefined;
  gridSize: number | undefined;
}) {
  // Committed scan parameters live in the URL; everything the user is still
  // fiddling with (keyword text, a clicked map point, a typed zip) stays local
  // until "Scan grid" — so exploring the map never spends a check.
  const committedCenter = useMemo<GridPoint>(
    () => ({
      lat: lat ?? DEFAULT_CENTER.lat,
      lng: lng ?? DEFAULT_CENTER.lng,
    }),
    [lat, lng],
  );
  const activeRadius = radius ?? 5;
  const activeGrid = gridSize ?? 5;
  const keyword = query.trim().toLowerCase();

  const [input, setInput] = useState(query);
  const [locationInput, setLocationInput] = useState("");
  const [radiusInput, setRadiusInput] = useState(String(activeRadius));
  const [gridInput, setGridInput] = useState(String(activeGrid));
  const [pendingCenter, setPendingCenter] = useState<GridPoint | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const mapCenter = pendingCenter ?? committedCenter;

  const points = useMemo(
    () => (keyword ? buildGrid(committedCenter, activeRadius, activeGrid) : []),
    [keyword, committedCenter, activeRadius, activeGrid],
  );

  const cellQueries = useQueries({
    queries: points.map((point) => ({
      queryKey: ["local-grid-cell", projectId, keyword, point.lat, point.lng],
      queryFn: async () =>
        getLocalGridCell({
          data: { projectId, keyword, lat: point.lat, lng: point.lng },
        }),
      staleTime: 60 * 60_000,
      retry: 1,
    })),
  });
  const cellStates = new Map<string, CellState>();
  points.forEach((point, index) => {
    const cellQuery = cellQueries[index];
    cellStates.set(`${point.lat}|${point.lng}`, {
      position: cellQuery?.data?.position ?? null,
      topCompetitors: cellQuery?.data?.topCompetitors ?? [],
      isLoading: cellQuery?.isLoading ?? false,
      isError: cellQuery?.isError ?? false,
    });
  });

  const shareOfVoice = computeGridShareOfVoice(
    [...cellStates.values()]
      .filter((state) => !state.isLoading && !state.isError)
      .map((state) => ({
        position: state.position,
        topCompetitors: state.topCompetitors,
      })),
  );

  const gridCount = Number(gridInput) * Number(gridInput);

  async function handleScan() {
    const nextKeyword = input.trim().toLowerCase();
    if (!nextKeyword) return;
    setLocationError(null);

    let center = pendingCenter ?? committedCenter;
    const locationQuery = locationInput.trim();
    if (locationQuery) {
      setIsLocating(true);
      try {
        const found = await geocodeLocation({
          data: { projectId, query: locationQuery },
        });
        if (!found) {
          setLocationError(
            "Couldn't find that location — try a zip code or “city, state”.",
          );
          return;
        }
        center = { lat: found.lat, lng: found.lng };
        setPendingCenter(center);
        setPendingLabel(found.label.split(",").slice(0, 2).join(","));
        setLocationInput("");
      } finally {
        setIsLocating(false);
      }
    }

    navigate({
      search: (prev) => ({
        ...prev,
        q: nextKeyword,
        lat: roundCoord(center.lat),
        lng: roundCoord(center.lng),
        r: Number(radiusInput),
        g: Number(gridInput),
      }),
      replace: false,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Grid3x3 className="size-5" />
          Local Rank Grid
        </h1>
        <p className="text-sm text-base-content/60">
          Where you actually show up on the map. Enter a keyword and a location
          (zip code, city, or address — or just click the map), choose the
          radius and grid, and scan.
        </p>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-2 p-4">
          <form
            className="flex flex-col gap-3 lg:flex-row lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void handleScan();
            }}
          >
            <label className="form-control w-full lg:max-w-xs">
              <span className="label-text pb-1 text-xs font-medium">
                Keyword
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="vending machines"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <label className="form-control w-full lg:max-w-xs">
              <span className="label-text pb-1 text-xs font-medium">
                Location
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="75201 · Plano, TX · any address"
                value={locationInput}
                onChange={(event) => setLocationInput(event.target.value)}
              />
            </label>
            <label className="form-control w-28">
              <span className="label-text pb-1 text-xs font-medium">
                Radius
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value={radiusInput}
                onChange={(event) => setRadiusInput(event.target.value)}
              >
                {RADIUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} mi
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control w-28">
              <span className="label-text pb-1 text-xs font-medium">Grid</span>
              <select
                className="select select-bordered select-sm w-full"
                value={gridInput}
                onChange={(event) => setGridInput(event.target.value)}
              >
                {GRID_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} × {option}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!input.trim() || isLocating}
            >
              {isLocating ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Search className="size-3.5" />
              )}
              Scan grid
            </button>
          </form>
          {locationError ? (
            <p className="text-xs text-error">{locationError}</p>
          ) : (
            <p className="text-xs text-base-content/50">
              {gridCount} checks per scan (~${(gridCount * 0.002).toFixed(2)}),
              cached for a day. Clicking the map moves the center — nothing is
              checked until you scan.
            </p>
          )}
        </div>
      </div>

      <div className="relative">
        <RankGridMap
          center={mapCenter}
          radiusMiles={activeRadius}
          points={points}
          cellStates={cellStates}
          onPickCenter={(point) => {
            setPendingCenter({
              lat: roundCoord(point.lat),
              lng: roundCoord(point.lng),
            });
            setPendingLabel(null);
          }}
        />

        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex items-center gap-2 rounded-full border border-base-300 bg-base-100/95 px-3 py-1.5 text-xs shadow">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full bg-success" />
            1–3
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full bg-orange-600" />
            4–10
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full bg-error" />
            11–20
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full bg-base-content/30" />
            not found
          </span>
        </div>

        {keyword && shareOfVoice.scannedPins > 0 ? (
          <div className="pointer-events-none absolute right-3 top-3 z-[1000] rounded-full border border-base-300 bg-base-100/95 px-3 py-1.5 text-xs shadow tabular-nums">
            <span className="font-medium">“{keyword}”</span> · visible at{" "}
            {shareOfVoice.myVisibleCount}/{shareOfVoice.scannedPins} pins
            {shareOfVoice.averagePosition != null
              ? ` · avg #${shareOfVoice.averagePosition.toFixed(1)}`
              : ""}
          </div>
        ) : null}

        {pendingCenter ? (
          <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex items-center gap-1.5 rounded-full border border-primary/40 bg-base-100/95 px-3 py-1.5 text-xs shadow">
            <LocateFixed className="size-3.5 text-primary" />
            {pendingLabel ??
              `${pendingCenter.lat.toFixed(3)}, ${pendingCenter.lng.toFixed(3)}`}{" "}
            — scan to check here
          </div>
        ) : null}

        {!keyword ? (
          <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
            <div className="rounded-lg border border-base-300 bg-base-100/95 px-4 py-2 text-sm shadow">
              Enter a keyword and scan to fill the grid
            </div>
          </div>
        ) : null}
      </div>

      {keyword && shareOfVoice.scannedPins > 0 ? (
        <GridShareOfVoiceCards shareOfVoice={shareOfVoice} />
      ) : null}
    </div>
  );
}

function GridShareOfVoiceCards({
  shareOfVoice,
}: {
  shareOfVoice: ReturnType<typeof computeGridShareOfVoice>;
}) {
  const { scannedPins, myTop3Count, myVisibleCount, averagePosition, leaders } =
    shareOfVoice;
  const top3Percent = Math.round((myTop3Count / scannedPins) * 100);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-base-300 bg-base-100 p-3">
          <div
            className="text-xs font-medium uppercase tracking-wide text-base-content/50"
            title="Share of the scanned pins where you rank in the local top 3"
          >
            Share of voice
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {top3Percent}%
          </div>
        </div>
        <div className="rounded-lg border border-base-300 bg-base-100 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
            Top-3 pins
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {myTop3Count}
            <span className="text-sm font-normal text-base-content/50">
              {" "}
              / {scannedPins}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-base-300 bg-base-100 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
            Visible pins
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {myVisibleCount}
            <span className="text-sm font-normal text-base-content/50">
              {" "}
              / {scannedPins}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-base-300 bg-base-100 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
            Avg rank
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {averagePosition != null ? `#${averagePosition.toFixed(1)}` : "—"}
          </div>
        </div>
      </div>

      {leaders.length > 0 ? (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body gap-2 p-4">
            <h2 className="text-sm font-semibold">Map leaders</h2>
            <p className="-mt-1 text-xs text-base-content/50">
              Who holds the local top 3 across your grid — including your own
              listing when it ranks.
            </p>
            <ul className="space-y-1.5">
              {leaders.map((leader) => (
                <li
                  key={leader.name}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-44 shrink-0 truncate" title={leader.name}>
                    {leader.name}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-base-200">
                    <span
                      className="block h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.round(leader.share * 100)}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-base-content/60 tabular-nums">
                    {leader.appearances} of {scannedPins} pins
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
