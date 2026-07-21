/**
 * Pure geometry for the Local Rank Grid map — split out so the pin layout is
 * unit-testable without Leaflet.
 */

export type GridPoint = { lat: number; lng: number };

const MILES_PER_DEGREE_LAT = 69;

/** Round to the same precision the server cache key uses (~11m). */
export function roundCoord(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * An n×n grid of pins centered on `center`, spanning `radiusMiles` from the
 * center to each edge (so the grid is 2r × 2r). Longitude spacing is corrected
 * for latitude so the grid stays visually square on the map.
 */
export function buildGrid(
  center: GridPoint,
  radiusMiles: number,
  size: number,
): GridPoint[] {
  if (size < 1) return [];
  if (size === 1) {
    return [{ lat: roundCoord(center.lat), lng: roundCoord(center.lng) }];
  }

  const latDegreesPerMile = 1 / MILES_PER_DEGREE_LAT;
  const lngDegreesPerMile =
    1 / (MILES_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180));
  const stepMiles = (2 * radiusMiles) / (size - 1);

  const points: GridPoint[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const offsetMilesNorth = radiusMiles - row * stepMiles;
      const offsetMilesEast = col * stepMiles - radiusMiles;
      points.push({
        lat: roundCoord(center.lat + offsetMilesNorth * latDegreesPerMile),
        lng: roundCoord(center.lng + offsetMilesEast * lngDegreesPerMile),
      });
    }
  }
  return points;
}

/** Pin color bucket for a local rank. */
export function rankBucket(
  position: number | null,
): "top" | "page1" | "deep" | "absent" {
  if (position == null) return "absent";
  if (position <= 3) return "top";
  if (position <= 10) return "page1";
  return "deep";
}
