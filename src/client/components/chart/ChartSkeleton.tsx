/**
 * What a chart card shows while its data is in flight.
 *
 * This replaces a centred spinner, and the reason is layout rather than taste.
 * A spinner sits in whatever box you give it — typically a `p-8` div about a
 * third the height of the chart it stands in for — so the card grows when the
 * data lands and everything below it jumps down the page. Watching the
 * reference dashboard load, that jump is the single thing it never does: each
 * card holds its final size and shows a silhouette of what is coming, so the
 * page is still while it fills in. `height` is required here for exactly that
 * reason; pass the same number the chart itself uses.
 *
 * The wave is Cloudflare's own idea (`kumo-chart-wave`) and reads as "a chart
 * is coming" in a way a spinner cannot — a spinner means "something, somewhere,
 * is busy". The keyframes live in app.css because that one is absent from the
 * Kumo stylesheet this app imports.
 *
 * The path repeats every 200 user units and the animation travels 400, so the
 * loop closes on itself with no seam. Two periods of travel, six periods drawn:
 * the extra width is what keeps the right-hand edge covered mid-slide.
 */

const PERIOD = 200;
const PERIODS = 16;
const WIDTH = PERIOD * PERIODS;
const MID = 50;
const AMPLITUDE = 30;

/** `Q` for the first hump, then `T` to mirror the control point for each one
 *  after it — which is what makes the joins smooth rather than kinked. */
const wavePath = (() => {
  let d = `M0,${MID} Q${PERIOD / 4},${MID - AMPLITUDE} ${PERIOD / 2},${MID}`;
  for (let x = PERIOD; x <= WIDTH; x += PERIOD / 2) {
    d += ` T${x},${MID}`;
  }
  return d;
})();

export function ChartSkeleton({
  height,
  label = "Loading chart",
}: {
  /** Match the chart this stands in for, or the card still changes size. */
  height: number;
  label?: string;
}) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height }}
      role="status"
      aria-label={label}
    >
      <svg
        // Fixed pixel width so the wave SLIDES rather than stretching; the
        // parent clips it.
        //
        // `height: 100%` is explicit and `inset-y-0` alone will not do it. An
        // <svg> is a REPLACED element, so `top: 0; bottom: 0` does not stretch
        // it the way it would a div — with `height: auto` it takes its height
        // from the viewBox's intrinsic ratio instead. Measured: 100px tall
        // inside a 220px box, wave pinned to the top edge.
        className="chart-wave absolute inset-y-0 left-0 text-base-content/15"
        style={{ width: WIDTH, height: "100%" }}
        viewBox={`0 0 ${WIDTH} 100`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={wavePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
