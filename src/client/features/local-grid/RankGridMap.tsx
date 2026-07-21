import { useEffect, useRef } from "react";
import type * as LeafletNamespace from "leaflet";
import {
  rankBucket,
  type GridPoint,
} from "@/client/features/local-grid/gridGeo";

type Leaflet = typeof LeafletNamespace;

export type CellState = {
  position: number | null;
  topCompetitors: string[];
  isLoading: boolean;
  isError: boolean;
};

const PIN_COLORS: Record<ReturnType<typeof rankBucket>, string> = {
  top: "#16a34a",
  page1: "#ea580c",
  deep: "#dc2626",
  absent: "#9ca3af",
};

function pinHtml(state: CellState | undefined): string {
  const size = 34;
  let background = "#9ca3af";
  let label = "…";
  if (state && !state.isLoading) {
    if (state.isError) {
      label = "!";
      background = "#6b7280";
    } else if (state.position == null) {
      label = "—";
      background = PIN_COLORS.absent;
    } else {
      label = String(state.position);
      background = PIN_COLORS[rankBucket(state.position)];
    }
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${background};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid rgba(255,255,255,.85);">${label}</div>`;
}

function pinTitle(state: CellState | undefined): string {
  if (!state || state.isLoading) return "Checking…";
  if (state.isError) return "Check failed";
  const rank =
    state.position == null ? "Not in the top 20" : `Rank #${state.position}`;
  return state.topCompetitors.length > 0
    ? `${rank}\nLeaders: ${state.topCompetitors.join(", ")}`
    : rank;
}

/** Zoom that comfortably frames a grid of the given radius. */
function zoomForRadius(radiusMiles: number): number {
  if (radiusMiles <= 1) return 14;
  if (radiusMiles <= 2) return 13;
  if (radiusMiles <= 5) return 12;
  if (radiusMiles <= 10) return 11;
  return 10;
}

/**
 * Leaflet map with the rank-grid pins. Leaflet touches `window` at import, so
 * it loads dynamically on the client; the container renders immediately.
 */
export function RankGridMap({
  center,
  radiusMiles,
  points,
  cellStates,
  onPickCenter,
}: {
  center: GridPoint;
  radiusMiles: number;
  points: GridPoint[];
  cellStates: Map<string, CellState>;
  onPickCenter: (point: GridPoint) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const mapRef = useRef<LeafletNamespace.Map | null>(null);
  const pinLayerRef = useRef<LeafletNamespace.LayerGroup | null>(null);
  const onPickRef = useRef(onPickCenter);
  onPickRef.current = onPickCenter;

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const imported = (await import("leaflet")) as Leaflet & {
        default?: Leaflet;
      };
      const L = imported.default ?? imported;
      if (disposed || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: zoomForRadius(radiusMiles),
        scrollWheelZoom: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.on("click", (event: LeafletNamespace.LeafletMouseEvent) => {
        onPickRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
      });

      leafletRef.current = L;
      mapRef.current = map;
      pinLayerRef.current = L.layerGroup().addTo(map);
      // First paint happens before the container is measured in some layouts.
      setTimeout(() => map.invalidateSize(), 0);
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      pinLayerRef.current = null;
    };
    // The map initializes once; center/zoom updates flow through the effects
    // below rather than re-creating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frame the scanned pins whenever a grid is plotted.
  const pointsKey = JSON.stringify(points);
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!map || !L || points.length === 0) return;
    map.fitBounds(
      L.latLngBounds(points.map((point) => [point.lat, point.lng])),
      { padding: [48, 48] },
    );
    // pointsKey stands in for the points array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  // Follow the (pending) center: zoom to it when nothing is plotted yet, and
  // pan over only when a picked location falls outside the current view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (points.length === 0) {
      map.setView([center.lat, center.lng], zoomForRadius(radiusMiles));
    } else if (!map.getBounds().contains([center.lat, center.lng])) {
      map.panTo([center.lat, center.lng]);
    }
    // Only center/radius changes should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, radiusMiles]);

  const stateSignature = JSON.stringify([
    points,
    [...cellStates.entries()].map(([key, state]) => [
      key,
      state.isLoading,
      state.isError,
      state.position,
    ]),
  ]);
  useEffect(() => {
    const L = leafletRef.current;
    const layer = pinLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    // Center pin (the "business location" the grid is anchored on).
    L.marker([center.lat, center.lng], {
      icon: L.divIcon({
        className: "",
        html: '<div style="width:16px;height:16px;border-radius:9999px;background:#4934c7;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
      interactive: false,
    }).addTo(layer);

    for (const point of points) {
      const key = `${point.lat}|${point.lng}`;
      const state = cellStates.get(key);
      L.marker([point.lat, point.lng], {
        icon: L.divIcon({
          className: "",
          html: pinHtml(state),
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        title: pinTitle(state),
        interactive: true,
      }).addTo(layer);
    }
    // stateSignature covers points + per-cell status; leaflet handles renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateSignature, center.lat, center.lng]);

  return (
    <div
      ref={containerRef}
      className="h-[520px] w-full overflow-hidden rounded-lg border border-base-300"
    />
  );
}
