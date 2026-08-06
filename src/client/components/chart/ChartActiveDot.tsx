/**
 * The marker Recharts draws on the hovered point.
 *
 * This has to be a component rather than the plain object the rest of the chart
 * tokens are, because of how Recharts wires `activeDot`: it passes the series
 * colour in as `fill` and hardcodes `stroke` to `#fff`. Its default marker is
 * therefore a colour-filled dot with a white halo — the inverse of the
 * reference, which draws a hole punched in the line: page-surface fill, series
 * colour on the ring.
 *
 * A static `{ fill, stroke }` object cannot express that, because the one value
 * we need on the stroke is only available at render time. Worse, the `#fff`
 * default is an outright bug in dark mode: a white halo on a dark surface.
 *
 * Verified in the browser rather than assumed — the first attempt at this was a
 * constant, and it rendered `stroke="#fff"` on a white page, i.e. an invisible
 * marker.
 */
export function ChartActiveDot(props: {
  cx?: number;
  cy?: number;
  /** Recharts hands the series colour in here, not on `stroke`. */
  fill?: string;
}) {
  const { cx, cy, fill } = props;
  if (cx == null || cy == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="var(--color-base-100)"
      stroke={fill}
      strokeWidth={2}
    />
  );
}
