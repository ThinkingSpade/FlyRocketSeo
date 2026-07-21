import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Grid3x3, Search } from "lucide-react";
import { getLocalGridCell } from "@/serverFunctions/local-grid";
import {
  buildGrid,
  roundCoord,
  type GridPoint,
} from "@/client/features/local-grid/gridGeo";
import {
  RankGridMap,
  type CellState,
} from "@/client/features/local-grid/RankGridMap";

type LocalGridNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

/** Quick jumps — the DFW cities Delio targets. The map click sets any other
 *  center. */
const CITY_PRESETS: ReadonlyArray<{ name: string; lat: number; lng: number }> =
  [
    { name: "Dallas", lat: 32.7767, lng: -96.797 },
    { name: "Fort Worth", lat: 32.7555, lng: -97.3308 },
    { name: "Arlington", lat: 32.7357, lng: -97.1081 },
    { name: "Plano", lat: 33.0198, lng: -96.6989 },
    { name: "Frisco", lat: 33.1507, lng: -96.8236 },
    { name: "Addison", lat: 32.9618, lng: -96.8292 },
    { name: "Allen", lat: 33.1032, lng: -96.6706 },
    { name: "Richardson", lat: 32.9483, lng: -96.7299 },
    { name: "Carrollton", lat: 32.9756, lng: -96.8899 },
    { name: "Bedford", lat: 32.844, lng: -97.1431 },
  ];

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
  const centerLat = lat ?? DEFAULT_CENTER.lat;
  const centerLng = lng ?? DEFAULT_CENTER.lng;
  const center = useMemo<GridPoint>(
    () => ({ lat: centerLat, lng: centerLng }),
    [centerLat, centerLng],
  );
  const activeRadius = radius ?? 5;
  const activeGrid = gridSize ?? 5;
  const keyword = query.trim().toLowerCase();

  const [input, setInput] = useState(query);
  const [radiusInput, setRadiusInput] = useState(String(activeRadius));
  const [gridInput, setGridInput] = useState(String(activeGrid));

  const points = useMemo(
    () => (keyword ? buildGrid(center, activeRadius, activeGrid) : []),
    [keyword, center, activeRadius, activeGrid],
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

  const resolved = [...cellStates.values()].filter(
    (state) => !state.isLoading && !state.isError,
  );
  const ranked = resolved.filter((state) => state.position != null);
  const averagePosition =
    ranked.length > 0
      ? ranked.reduce((sum, state) => sum + (state.position ?? 0), 0) /
        ranked.length
      : null;

  const applySearch = (next: Partial<Record<string, unknown>>) => {
    navigate({
      search: (prev) => ({ ...prev, ...next }),
      replace: false,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Grid3x3 className="size-5" />
          Local Rank Grid
        </h1>
        <p className="text-sm text-base-content/60">
          A Local-Falcon-style map of your local rankings: pick a center (click
          the map or jump to a city), choose the radius and grid, and scan. Each
          pin is your local-finder rank at that exact spot — hover a pin for the
          local leaders there.
        </p>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body gap-3 p-4">
          <form
            className="flex flex-col gap-3 lg:flex-row lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const next = input.trim().toLowerCase();
              if (!next) return;
              applySearch({
                q: next,
                lat: roundCoord(center.lat),
                lng: roundCoord(center.lng),
                r: Number(radiusInput),
                g: Number(gridInput),
              });
            }}
          >
            <label className="form-control w-full lg:max-w-sm">
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
            <label className="form-control w-full lg:max-w-44">
              <span className="label-text pb-1 text-xs font-medium">
                Jump to city
              </span>
              <select
                className="select select-bordered select-sm w-full"
                value=""
                onChange={(event) => {
                  const preset = CITY_PRESETS.find(
                    (city) => city.name === event.target.value,
                  );
                  if (preset) {
                    applySearch({
                      lat: preset.lat,
                      lng: preset.lng,
                    });
                  }
                }}
              >
                <option value="">Pick a city…</option>
                {CITY_PRESETS.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control w-full lg:max-w-32">
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
            <label className="form-control w-full lg:max-w-32">
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
              disabled={!input.trim()}
            >
              <Search className="size-3.5" />
              Scan grid
            </button>
          </form>
          <p className="text-xs text-base-content/50">
            Click anywhere on the map to move the center pin.{" "}
            {Number(gridInput) * Number(gridInput)} checks per scan (~$
            {(Number(gridInput) * Number(gridInput) * 0.002).toFixed(2)}),
            cached for a day.
          </p>
        </div>
      </div>

      <RankGridMap
        center={center}
        radiusMiles={activeRadius}
        points={points}
        cellStates={cellStates}
        onPickCenter={(point) => {
          applySearch({
            lat: roundCoord(point.lat),
            lng: roundCoord(point.lng),
          });
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/60">
        <span>
          <span className="font-medium text-success">● #1–3</span>{" "}
          <span className="font-medium text-warning">● #4–10</span>{" "}
          <span className="font-medium text-error">● #11–20</span>{" "}
          <span className="font-medium text-base-content/40">
            ● not in top 20
          </span>
        </span>
        {keyword && resolved.length > 0 ? (
          <span className="tabular-nums">
            Visible at {ranked.length}/{resolved.length} pins
            {averagePosition != null
              ? ` · avg rank ${averagePosition.toFixed(1)}`
              : ""}
          </span>
        ) : null}
      </div>

      {!keyword ? (
        <div className="card border border-dashed border-base-300">
          <div className="card-body items-center py-8 text-center">
            <p className="font-medium">
              Enter a keyword and scan to fill the grid
            </p>
            <p className="max-w-md text-sm text-base-content/60">
              The pins show where in the metro you actually appear when locals
              search — and where competitors own the map.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
