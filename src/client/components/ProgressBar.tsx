/**
 * A thin inline progress bar.
 *
 * Kumo's Meter is the obvious candidate and is the wrong shape: it requires a
 * `label` and renders it above the track, but all three call sites here are
 * bare bars sitting inside a row that already says what they measure — under a
 * score, beside a step count, next to a run status. Meter would add a second
 * label above each.
 *
 * Replaces DaisyUI's `.progress`, which was a styled native <progress>. That
 * element only accepts colour through vendor pseudo-elements
 * (::-webkit-progress-value, ::-moz-progress-bar), which is why it needed a
 * plugin at all; two divs need none, and carry the ARIA explicitly.
 */
export function ProgressBar({
  value,
  max,
  label,
  className = "",
  barClassName = "h-1.5",
}: {
  value: number;
  max: number;
  /** Names the bar for assistive tech, since the visible caption is a sibling
   *  rather than something this renders. */
  label: string;
  className?: string;
  barClassName?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={`overflow-hidden rounded-full bg-base-300 ${barClassName} ${className}`}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-(--motion-duration-base) ease-out-soft"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
