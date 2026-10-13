// Pure SVG path math for TrendSparkline (no React), split out so the
// scaling rules are unit-testable.

export type SparklinePoint = {
  year: number;
  month: number;
  searchVolume: number | null;
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

  const values = sorted.map((point) =>
    point.searchVolume !== null &&
    Number.isFinite(point.searchVolume) &&
    point.searchVolume >= 0
      ? point.searchVolume
      : null,
  );
  const available = values.filter((value): value is number => value !== null);
  if (available.length < 2) return null;
  const max = Math.max(...available);
  const min = Math.min(...available);
  const span = max - min;

  const stepX = width / (sorted.length - 1);
  const usableHeight = height - PAD_Y * 2;

  const coords = values.map((value, index) => {
    if (value === null) return null;
    const x = round(index * stepX);
    const y =
      span === 0
        ? height / 2
        : round(PAD_Y + (1 - (value - min) / span) * usableHeight);
    return { x, y };
  });

  const segments: Array<Array<{ x: number; y: number }>> = [];
  let segment: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < coords.length; index++) {
    const point = coords[index];
    const month = sorted[index].year * 12 + sorted[index].month;
    const previous =
      index > 0 ? sorted[index - 1].year * 12 + sorted[index - 1].month : null;
    if (!point || (previous !== null && month !== previous + 1)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (point) segment.push(point);
  }
  if (segment.length) segments.push(segment);
  const lines = segments.map((segmentPoints) =>
    segmentPoints
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" "),
  );
  const line = lines.join(" ");
  const area = segments
    .map(
      (segmentPoints, index) =>
        `${lines[index]} L${segmentPoints[segmentPoints.length - 1].x},${height} L${segmentPoints[0].x},${height} Z`,
    )
    .join(" ");

  return { line, area };
}
