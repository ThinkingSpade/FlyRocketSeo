import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Sparkline } from "@/client/components/Sparkline";

export type InsightTone =
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

// Plain colored icons, no chip backgrounds — matches the app's native icon
// language (muted Phosphor glyphs like `text-base-content/45`). Tones stay
// quiet; only the meaning-bearing ones get color.
const ICON_COLOR: Record<InsightTone, string> = {
  primary: "text-primary/70",
  success: "text-success/80",
  warning: "text-warning",
  error: "text-error/80",
  info: "text-info/80",
  neutral: "text-base-content/35",
};

const BORDER: Record<InsightTone, string> = {
  primary: "border-base-300",
  success: "border-base-300",
  warning: "border-warning/40",
  error: "border-error/40",
  info: "border-base-300",
  neutral: "border-base-300",
};

/** A small inline icon for card headers, styled like the app's own icons. */
export function InsightIcon({
  icon: Icon,
  tone = "neutral",
}: {
  icon: Icon;
  tone?: InsightTone;
}) {
  return (
    <Icon
      className={`size-4 shrink-0 ${tone === "neutral" ? "text-base-content/45" : ICON_COLOR[tone]}`}
    />
  );
}

/** Height of the sparkline strip, and of the block that stands in for it while
 *  loading. Shared so the two can never drift apart — if they did, the tile
 *  would change height when data lands, which is the one thing this is for. */
const TREND_H = "h-10";

/**
 * Stat tile in the app's native style: uppercase muted label with a small
 * quiet icon, big tabular value. `tone` colors the icon and, for
 * warning/error states, the border — no chip backgrounds.
 *
 * Pass `trend` to fill the bottom of the tile with a sparkline. That strip was
 * empty before, and on the reference dashboard it is the single biggest
 * difference between their stat tiles and ours: theirs put a trend line in the
 * bottom ~40% of every tile, bleeding to the card's edges, so a tile answers
 * "and which way is it going?" without costing a second card. Hence the
 * negative margins — the strip has to escape the card's padding to reach the
 * border, the way theirs does.
 *
 * Pass `loading` for the placeholder. It renders the same three bands at the
 * same heights, so the tile does not resize when the data arrives. That is what
 * makes the reference feel smooth as it loads: not easing curves, but the fact
 * that a loading card is exactly the shape of the loaded one, so nothing on the
 * page moves.
 */
export function InsightTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
  title,
  trend,
  loading = false,
}: {
  icon: Icon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: InsightTone;
  title?: string;
  /** Oldest → newest. Fewer than 2 points renders nothing, as a trend needs a
   *  direction; the tile keeps its compact height in that case. */
  trend?: number[];
  loading?: boolean;
}) {
  const showTrend = !loading && (trend?.length ?? 0) >= 2;
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-base-100 p-3 ${BORDER[tone]}`}
      title={title}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-base-content/50">
          {label}
        </span>
        <Icon className={`size-3.5 shrink-0 ${ICON_COLOR[tone]}`} />
      </div>

      {loading ? (
        <>
          {/* Widths approximate a number and a short caption rather than
              filling the row: a placeholder the full width of the card reads as
              a loaded empty state, not as something still arriving. */}
          <div className="mt-1 h-7 w-20 skeleton rounded" />
          <div className="mt-0.5 h-4 w-28 skeleton rounded" />
        </>
      ) : (
        <>
          <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
          {hint ? (
            <div className="mt-0.5 text-xs text-base-content/50">{hint}</div>
          ) : null}
        </>
      )}

      {loading ? (
        <div className={`-mx-3 -mb-3 mt-2 ${TREND_H} skeleton rounded-none`} />
      ) : showTrend ? (
        <div className={`-mx-3 -mb-3 mt-2 ${TREND_H} ${ICON_COLOR[tone]}`}>
          {/* Colour comes from the tone's icon class and the paths use
              `currentColor`, so the line matches the tile's own accent without
              a second palette to keep in sync. */}
          <Sparkline values={trend ?? []} />
        </div>
      ) : null}
    </div>
  );
}
