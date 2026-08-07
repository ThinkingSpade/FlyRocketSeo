/* eslint-disable max-lines-per-function -- Grid authorization and cell rendering must share one in-memory scan state. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Grid3x3,
  Hash,
  LocateFixed,
  MapPin,
  Megaphone,
  Search,
  Trophy,
} from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import {
  geocodeLocation,
  getCachedLocalGridCells,
  getLocalGridCell,
} from "@/serverFunctions/local-grid";
import { getCachedBusinessContext } from "@/serverFunctions/local-seo";
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
import { GridShareOfVoiceCards } from "@/client/features/local-grid/GridShareOfVoiceCards";
import type { AnalyzePreviewItem } from "@/client/components/AnalyzeDomainPrompt";
import { useSeedSuggestions } from "@/client/features/dashboard/SeedKeywordField";
import {
  createMeteredRunKey,
  useAuthorizedRun,
  withMeteredRunNonce,
} from "@/client/lib/useMeteredQuery";
import { AppPageShell } from "@/client/components/AppPageShell";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Input } from "@cloudflare/kumo/components/input";

const GRID_PREVIEW: AnalyzePreviewItem[] = [
  {
    icon: Megaphone,
    title: "Share of voice",
    description: "Share of scanned pins where you rank in the local top 3",
  },
  {
    icon: MapPin,
    title: "Pin-by-pin ranking",
    description: "A colored grid showing your position at each location",
  },
  {
    icon: Trophy,
    title: "Map leaders",
    description: "Which businesses own the top 3 across your area",
  },
  {
    icon: Hash,
    title: "Average rank",
    description: "Your mean local position across every pin scanned",
  },
];

type LocalGridNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

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
  const cachedBusinessQuery = useQuery({
    queryKey: ["cached-business-context", projectId],
    queryFn: () => getCachedBusinessContext({ data: { projectId } }),
    staleTime: 5 * 60_000,
  });
  const cachedBusiness = cachedBusinessQuery.data;
  const profileLat = cachedBusiness?.profile.latitude;
  const profileLng = cachedBusiness?.profile.longitude;
  const committedCenter = useMemo<GridPoint | null>(
    () =>
      lat != null && lng != null
        ? { lat, lng }
        : profileLat != null && profileLng != null
          ? { lat: profileLat, lng: profileLng }
          : null,
    [lat, lng, profileLat, profileLng],
  );
  const activeRadius = radius ?? 5;
  const activeGrid = gridSize ?? 5;
  const [activeScan, setActiveScan] = useState<{
    keyword: string;
    center: GridPoint;
    radius: number;
    gridSize: number;
  } | null>(null);
  const suggestions = useSeedSuggestions(projectId);
  const prefilledKeyword = query.trim().toLowerCase();
  const [input, setInput] = useState(query);
  const [locationInput, setLocationInput] = useState("");
  const [radiusInput, setRadiusInput] = useState(String(activeRadius));
  const [gridInput, setGridInput] = useState(String(activeGrid));
  const [pendingCenter, setPendingCenter] = useState<GridPoint | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const hasPrefilledKeyword = useRef(Boolean(query.trim()));
  useEffect(() => {
    if (hasPrefilledKeyword.current || !suggestions[0]) return;
    hasPrefilledKeyword.current = true;
    setInput(suggestions[0].keyword);
  }, [suggestions]);

  const mapCenter = pendingCenter ?? activeScan?.center ?? committedCenter;
  const currentRunKey = createMeteredRunKey(
    projectId,
    input.trim().toLowerCase(),
    mapCenter,
    Number(radiusInput),
    Number(gridInput),
  );
  const run = useAuthorizedRun(currentRunKey);

  const activePoints = useMemo(
    () =>
      activeScan
        ? buildGrid(activeScan.center, activeScan.radius, activeScan.gridSize)
        : [],
    [activeScan],
  );
  const restorePoints = useMemo(
    () =>
      prefilledKeyword && committedCenter
        ? buildGrid(committedCenter, activeRadius, activeGrid)
        : [],
    [activeGrid, activeRadius, committedCenter, prefilledKeyword],
  );
  const cachedCellsQuery = useQuery({
    queryKey: [
      "local-grid-cached-cells",
      projectId,
      prefilledKeyword,
      restorePoints,
    ],
    queryFn: () =>
      getCachedLocalGridCells({
        data: { projectId, keyword: prefilledKeyword, points: restorePoints },
      }),
    enabled: activeScan == null && restorePoints.length > 0,
    staleTime: 60_000,
  });
  const restoredCells = activeScan == null ? (cachedCellsQuery.data ?? []) : [];
  const points =
    activeScan != null
      ? activePoints
      : restoredCells.map((cell) => ({ lat: cell.lat, lng: cell.lng }));
  const keyword =
    activeScan?.keyword ?? (restoredCells.length > 0 ? prefilledKeyword : "");

  const cellQueries = useQueries({
    queries: activePoints.map((point) => ({
      queryFn: async () =>
        getLocalGridCell({
          data: { projectId, keyword, lat: point.lat, lng: point.lng },
        }),
      queryKey: withMeteredRunNonce(
        ["local-grid-cell", projectId, keyword, point.lat, point.lng],
        run.runNonce,
      ),
      enabled: activeScan != null && run.authorized,
      staleTime: Infinity,
      gcTime: 60 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      // No retry: this query spends money. react-query's retry doubles the
      // server function invocations, and each one can reach the metered provider
      // independently, so a transient failure could be billed twice per click.
      retry: 0,
    })),
  });
  const cellStates = new Map<string, CellState>();
  activePoints.forEach((point, index) => {
    const cellQuery = cellQueries[index];
    cellStates.set(`${point.lat}|${point.lng}`, {
      position: cellQuery?.data?.position ?? null,
      topCompetitors: cellQuery?.data?.topCompetitors ?? [],
      isLoading: cellQuery?.isLoading ?? false,
      isError: cellQuery?.isError ?? false,
    });
  });
  restoredCells.forEach((cell) => {
    cellStates.set(`${cell.lat}|${cell.lng}`, {
      position: cell.position,
      topCompetitors: cell.topCompetitors,
      isLoading: false,
      isError: false,
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
    if (!center) {
      setLocationError(
        "Set a business location by entering a city, zip code, or address, or click the map.",
      );
      return;
    }

    const nextRadius = Number(radiusInput);
    const nextGridSize = Number(gridInput);
    const roundedCenter = {
      lat: roundCoord(center.lat),
      lng: roundCoord(center.lng),
    };
    setActiveScan({
      keyword: nextKeyword,
      center: roundedCenter,
      radius: nextRadius,
      gridSize: nextGridSize,
    });
    run.authorize(
      createMeteredRunKey(
        projectId,
        nextKeyword,
        roundedCenter,
        nextRadius,
        nextGridSize,
      ),
    );
    navigate({
      search: (prev) => ({
        ...prev,
        q: nextKeyword,
        lat: roundedCenter.lat,
        lng: roundedCenter.lng,
        r: nextRadius,
        g: nextGridSize,
      }),
      replace: false,
    });
  }

  return (
    <AppPageShell>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Grid3x3 className="size-6" />
          Local Rank Grid
        </h1>
        <p className="text-sm text-base-content/60">
          Where you actually show up on the map. Enter a keyword and a location
          (zip code, city, or address — or just click the map), choose the
          radius and grid, and scan.
        </p>
      </div>

      <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
        <div className="flex flex-auto flex-col gap-2 p-4 text-sm">
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
              <Input
                passwordManagerIgnore
                type="text"
                size="sm"
                className="w-full"
                placeholder="vending machines"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <label className="form-control w-full lg:max-w-xs">
              <span className="label-text pb-1 text-xs font-medium">
                Location
              </span>
              <Input
                passwordManagerIgnore
                type="text"
                size="sm"
                className="w-full"
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
                className="app-select app-select-sm w-full"
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
                className="app-select app-select-sm w-full"
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
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!input.trim() || isLocating}
            >
              {isLocating ? (
                <Loader size="sm" />
              ) : (
                <Search className="size-3.5" />
              )}
              Scan grid
            </Button>
          </form>
          {locationError ? (
            <p className="text-xs text-error">{locationError}</p>
          ) : (
            <p className="text-xs text-base-content/50">
              {cachedBusiness?.profile.address && !lat && !lng
                ? `Centered on cached profile: ${cachedBusiness.profile.address}. `
                : !mapCenter
                  ? "Set a location before scanning. "
                  : ""}
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
          radiusMiles={activeScan?.radius ?? activeRadius}
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
              {mapCenter
                ? "Review the project keyword and scan to fill the grid"
                : "Set a location to center this project's rank grid"}
            </div>
          </div>
        ) : null}
      </div>

      {keyword && shareOfVoice.scannedPins > 0 ? (
        <GridShareOfVoiceCards shareOfVoice={shareOfVoice} />
      ) : null}

      {!keyword ? (
        <div className="relative flex flex-col rounded-xl border border-base-300 bg-base-100">
          <div className="flex flex-auto flex-col gap-3 p-5 text-sm">
            <div>
              <h2 className="text-base font-semibold">
                Map your local visibility
              </h2>
              <p className="mt-0.5 max-w-2xl text-sm text-base-content/60">
                Enter a keyword above and scan — each pin checks the local
                results from that spot, so you see exactly where you drop off
                the map. A scan costs about $0.002 per pin and caches for a day.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {GRID_PREVIEW.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-base-300 p-3"
                >
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <InsightIcon icon={item.icon} />
                    {item.title}
                  </div>
                  <p className="mt-1 text-xs text-base-content/55">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </AppPageShell>
  );
}
