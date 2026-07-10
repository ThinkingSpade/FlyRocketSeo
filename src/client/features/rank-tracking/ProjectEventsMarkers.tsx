import { Flag } from "lucide-react";
import { ReferenceLine } from "recharts";
import {
  formatEventDate,
  type ProjectEventMarker,
} from "./projectEventMarkers";

// One accent for all markers — purple sits apart from every series color in
// use (blue/teal desktop-mobile lines, green/blue/amber/gray buckets).
export const EVENT_MARKER_COLOR = "#a855f7";

/**
 * Dashed vertical line per event. Returns an ELEMENT ARRAY (not a wrapper
 * component) because recharts only recognizes chart children it can inspect
 * directly — same reason series are rendered via inline `.map()`.
 */
export function renderEventMarkerLines(markers: ProjectEventMarker[]) {
  return markers.map((marker) => (
    <ReferenceLine
      key={`project-event-${marker.id}`}
      x={marker.ts}
      stroke={EVENT_MARKER_COLOR}
      strokeDasharray="3 3"
      strokeOpacity={0.5}
      ifOverflow="discard"
      label={{
        value: "⚑",
        position: "insideTop",
        fontSize: 11,
        fill: EVENT_MARKER_COLOR,
      }}
    />
  ));
}

const MAX_STRIP_EVENTS = 3;

/** Compact legend under a chart explaining the ⚑ markers (newest first). */
export function ProjectEventsStrip({
  markers,
  onManage,
}: {
  markers: ProjectEventMarker[];
  /** Opens the events manager; also the target of the "+N more" overflow. */
  onManage?: () => void;
}) {
  if (markers.length === 0) return null;

  const newestFirst = markers.toReversed();
  const shown = newestFirst.slice(0, MAX_STRIP_EVENTS);
  const hiddenCount = newestFirst.length - shown.length;

  return (
    <div className="space-y-0.5 pt-1">
      {shown.map((marker) => (
        <p
          key={marker.id}
          className="flex items-baseline gap-1.5 text-[11px] text-base-content/60"
        >
          <Flag
            className="size-3 shrink-0 translate-y-0.5"
            style={{ color: EVENT_MARKER_COLOR }}
          />
          <span className="whitespace-nowrap tabular-nums">
            {formatEventDate(marker.eventDate)}
          </span>
          <span className="truncate text-base-content/80">{marker.title}</span>
        </p>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          className="btn btn-ghost btn-xs -ml-1.5 h-5 min-h-0 px-1.5 text-[11px] text-base-content/50"
          onClick={onManage}
          disabled={!onManage}
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  );
}
