import type { ReactNode } from "react";

/**
 * A ranked label / bar / value list.
 *
 * This is the single most repeated visual on the Cloudflare dashboard that is
 * the reference for this work: on their 18-chart "Traffic overview", THIRTEEN
 * of the eighteen are this exact row — top paths, top hosts, client IPs,
 * browsers, operating systems, user agents, HTTP versions, cache statuses,
 * origin status codes, countries. Most of what reads as "graphics drawing"
 * there is not a chart library at all; it is this, repeated, with the numbers
 * aligned.
 *
 * Kumo does NOT ship it. Its 48 components include `Meter`, which is the
 * closest thing, but Meter puts its label *above* the track for quota displays
 * ("Storage used", 65%), so a list of them stacks to three times the height and
 * loses the column alignment that makes a ranked list readable. The track is
 * the reusable idea; the row is ours.
 *
 * Geometry is measured from the live dashboard rather than guessed:
 *   row      32px tall — `py-1.5` with a 13px label
 *   gap      12px between columns (`gap-x-3`)
 *   track    6px tall, fully rounded
 *   label    `text-sm font-medium` — 13px here and 13px there, because Kumo's
 *            Tailwind scale is already live in this app (`text-base` is 14px)
 *   value    `tabular-nums`, right-aligned, so digits form a column
 *
 * The bar fill is `--color-kumo-brand`, which resolves through `light-dark()`
 * off `color-scheme` — both DaisyUI themes here declare it, so this follows the
 * existing theme toggle with no wiring, and the token is already remapped to
 * FlyRocketSEO's indigo. Our identity on their craft.
 *
 * The track is `base-content/10` rather than Kumo's `--color-kumo-fill`, on
 * purpose: it sits on DaisyUI surfaces, and a translucent foreground stays
 * correct on `base-100` and `base-200` alike, where a fixed grey would band
 * against one of them.
 */

type BarListItem = {
  /** Stable key. Falls back to the index when absent. */
  id?: string;
  label: ReactNode;
  /**
   * Magnitude the bar is drawn from. Always a number, even when `display`
   * shows something else — keeping these separate is what lets a row read
   * "2 → 5 (+3)" while the bar still encodes the 5.
   */
  value: number;
  /** Text in the value column. Defaults to a compact-formatted `value`. */
  display?: ReactNode;
  /**
   * Bar colour for this row. Defaults to the brand fill. Use only where the
   * category already has a meaning elsewhere on the page (position buckets,
   * status classes) — a different colour per row with no shared legend is
   * decoration, and Cloudflare's own bar lists are deliberately monochrome.
   */
  color?: string;
};

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function BarList({
  items,
  max,
  emptyLabel = "Nothing to show yet.",
}: {
  items: BarListItem[];
  /**
   * Value the bars are scaled against. Defaults to the largest item, which is
   * what the reference does: the top row's bar is always full, so the list
   * reads as a ranking. Pass an explicit max when the rows are parts of a known
   * whole (12 tracked keywords across 4 buckets) and a full top bar would
   * overstate it.
   */
  max?: number;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-1.5 text-sm text-base-content/60">{emptyLabel}</p>;
  }

  // Guard the divide: an all-zero list is a real state (no clicks yet), and
  // `value / 0` would paint every bar NaN-wide rather than empty.
  const scale = Math.max(max ?? Math.max(...items.map((i) => i.value)), 0);

  return (
    <ul className="-mx-2">
      {items.map((item, index) => {
        const pct = scale > 0 ? Math.min(100, (item.value / scale) * 100) : 0;
        return (
          <li
            key={item.id ?? index}
            // Tint, never lift. The reference's own rule, and this file is the
            // dense-list case it calls out: a 1px translate on a 32px row that
            // sits in a stack of twelve reads as jitter.
            className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-1.5 transition-colors duration-(--motion-duration-fast) hover:bg-base-content/5"
          >
            <span className="truncate text-sm font-medium">{item.label}</span>
            {/* Decorative: the number is already in the value column, so
                announcing the bar too would read every row twice. */}
            <span
              aria-hidden="true"
              className="h-1.5 w-full overflow-hidden rounded-full bg-base-content/10"
            >
              <span
                className="block h-full rounded-full transition-[width] duration-(--motion-duration-slow) ease-(--ease-out-soft)"
                style={{
                  width: `${pct}%`,
                  backgroundColor: item.color ?? "var(--color-kumo-brand)",
                }}
              />
            </span>
            <span className="text-sm tabular-nums">
              {item.display ?? compact.format(item.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
