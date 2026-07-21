// Pure aggregation for the grid Share-of-Voice card (no I/O), split out so
// the leaderboard math is unit-testable.

type GridCellResult = {
  /** 1-based local rank of the project at this pin, or null when unranked. */
  position: number | null;
  /** Top-3 business names at this pin (may include the project itself). */
  topCompetitors: string[];
};

type GridLeader = {
  name: string;
  /** Pins where this business is in the local top 3. */
  appearances: number;
  /** appearances / scanned pins, 0..1. */
  share: number;
};

type GridShareOfVoice = {
  scannedPins: number;
  /** Pins where the project ranks in the top 3. */
  myTop3Count: number;
  /** Pins where the project appears at all. */
  myVisibleCount: number;
  averagePosition: number | null;
  leaders: GridLeader[];
};

const MAX_LEADERS = 8;

/**
 * Aggregate scanned grid cells into map-wide stats: the project's top-3
 * coverage plus the businesses holding the most top-3 spots across pins —
 * the Map Rank Tracker-style "who owns this map" summary.
 */
export function computeGridShareOfVoice(
  cells: GridCellResult[],
): GridShareOfVoice {
  const scannedPins = cells.length;
  let myTop3Count = 0;
  let myVisibleCount = 0;
  let positionSum = 0;

  const appearancesByName = new Map<string, number>();
  for (const cell of cells) {
    if (cell.position != null) {
      myVisibleCount += 1;
      positionSum += cell.position;
      if (cell.position <= 3) myTop3Count += 1;
    }
    for (const name of new Set(cell.topCompetitors)) {
      appearancesByName.set(name, (appearancesByName.get(name) ?? 0) + 1);
    }
  }

  const leaders = [...appearancesByName.entries()]
    .map(([name, appearances]) => ({
      name,
      appearances,
      share: scannedPins > 0 ? appearances / scannedPins : 0,
    }))
    .toSorted(
      (a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name),
    )
    .slice(0, MAX_LEADERS);

  return {
    scannedPins,
    myTop3Count,
    myVisibleCount,
    averagePosition: myVisibleCount > 0 ? positionSum / myVisibleCount : null,
    leaders,
  };
}
