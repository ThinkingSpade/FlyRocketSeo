/**
 * Theme tokens for Recharts, which cannot take Tailwind classes.
 *
 * Every chart in the app used to hardcode `fill: "#888"` for axis ticks and
 * `rgba(150,150,150,0.3)` for the hover cursor — 23 and 10 copies respectively.
 * A fixed grey cannot be right in both themes, and it was in fact wrong in both:
 * against `#131c2b` in dark it reads as disabled, and against white in light it
 * lands near 3.4:1 contrast, under the 4.5:1 that 10px text needs.
 *
 * Recharts takes SVG presentation attributes, so a CSS variable works where a
 * class does not: the browser resolves `var(--color-base-content)` per theme at
 * paint time, the same value the rest of the UI derives its text colour from.
 *
 * Kept as plain objects rather than a hook. These are constants; a hook would
 * imply they can change per render and invite subscribing to something.
 */

/** daisyUI's foreground token. `#172033` light, `#eaf0fa` dark. */
const BASE_CONTENT = "var(--color-base-content)";

/**
 * Axis tick labels.
 *
 * `fillOpacity` rather than a translucent colour, so the tick sits on the same
 * ramp as the `text-base-content/60` labels around it instead of approximating
 * them.
 */
export const CHART_AXIS_TICK = {
  fontSize: 10,
  fill: BASE_CONTENT,
  fillOpacity: 0.6,
} as const;

/** Slightly larger ticks, for the charts that were already using 11px. */
export const CHART_AXIS_TICK_SM = {
  ...CHART_AXIS_TICK,
  fontSize: 11,
} as const;

/** Hover crosshair for line and area charts. */
export const CHART_CURSOR_LINE = {
  stroke: BASE_CONTENT,
  strokeOpacity: 0.3,
} as const;

/** Hover band for bar charts, where the cursor is a filled rectangle. */
export const CHART_CURSOR_BAR = {
  fill: BASE_CONTENT,
  fillOpacity: 0.08,
} as const;

/** Grid lines. Deliberately fainter than the axis text. */
export const CHART_GRID_STROKE = {
  stroke: BASE_CONTENT,
  strokeOpacity: 0.12,
} as const;
