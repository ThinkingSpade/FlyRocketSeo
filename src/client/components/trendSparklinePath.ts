// Pure SVG path math for TrendSparkline (no React), split out so the
// scaling rules are unit-testable.

export type SparklinePoint = {
  year: number;
  month: number;
  searchVolume: number;
};

type SparklinePath = {
  /** Polyline through the data points. */
  line: string;
  /** Same polyline closed down to the baseline, for the gradient fill. */
  area: string;
};

const MAX_POINTS = 12;
/** Keep the stroke inside the viewBox at both vertical extremes. */
const PAD_Y = 1.5;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build line + area paths for the last 12 chronological points, scaled to
 * the box. Returns null when fewer than 2 points exist. A flat series draws
 * a midline rather than collapsing onto the top edge.
 */
export function buildSparklinePath(
  points: SparklinePoint[],
  width: number,
  height: number,
): SparklinePath | null {
  const sorted = points
    .toSorted((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))
    .slice(-MAX_POINTS);
  if (sorted.length < 2) return null;

  const values = sorted.map((point) => Math.max(0, point.searchVolume));
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;

  const stepX = width / (sorted.length - 1);
  const usableHeight = height - PAD_Y * 2;

  const coords = values.map((value, index) => {
    const x = round(index * stepX);
    const y =
      span === 0
        ? height / 2
        : round(PAD_Y + (1 - (value - min) / span) * usableHeight);
    return { x, y };
  });

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const last = coords[coords.length - 1];
  const area = `${line} L${last.x},${height} L0,${height} Z`;

  return { line, area };
}
