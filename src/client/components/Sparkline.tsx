/**
 * A tiny axis-less trend line, for the bottom of a stat tile.
 *
 * Deliberately hand-rolled SVG rather than a recharts chart. Two reasons, and
 * the first is the important one:
 *
 * 1. `InsightTile` is imported by pages all over the app. Giving it a recharts
 *    dependency would pull the whole charting library (~195 KB) into every
 *    chunk that renders a stat tile — the exact barrel-drag documented at the
 *    top of features/keywords/components/AreaTrendChart.tsx, which put recharts
 *    in the client entry and made every visitor download it, including on
 *    sign-in. A sparkline is two SVG paths; it does not justify that.
 * 2. It is what the reference does. Most of what reads as "graphics drawing" on
 *    the Cloudflare dashboard is not a chart library.
 *
 * `preserveAspectRatio="none"` lets one fixed viewBox stretch to whatever width
 * the tile happens to be, which is what makes the line span the full card and
 * bleed to its edges. That would normally smear the stroke horizontally, so the
 * line carries `vector-effect="non-scaling-stroke"` to hold an even weight at
 * any width.
 */

const VIEW_W = 100;
const VIEW_H = 32;

export function Sparkline({
  values,
  className = "",
  ariaLabel,
}: {
  values: number[];
  className?: string;
  /** Omit for a purely decorative line whose numbers are already stated. */
  ariaLabel?: string;
}) {
  // One point is not a trend, and zero would divide by zero below.
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series has no range; draw it down the middle rather than at an edge.
  const span = max - min || 1;
  const stepX = VIEW_W / (values.length - 1);

  const points = values.map((value, index) => {
    const x = index * stepX;
    // SVG y grows downward, so the larger value has to get the smaller y.
    const y = VIEW_H - ((value - min) / span) * VIEW_H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M${points.join(" L")}`;
  // Close the shape down to the baseline for the fill, leaving the stroke open
  // so no vertical edge is drawn at either end.
  const area = `${line} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className={`h-full w-full ${className}`}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <path d={area} fill="currentColor" fillOpacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
