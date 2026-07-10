// Pure date math for rendering project events ("published content", "fixed
// redirects"…) as vertical markers on rank-trend charts. Events carry a
// calendar date ("YYYY-MM-DD", no timezone); charts plot millisecond
// timestamps and format them in the viewer's local timezone — so all
// conversions here anchor to the LOCAL day to keep a marker on the same
// calendar day as the axis ticks around it.

export interface ProjectEventLike {
  id: string;
  eventDate: string;
  title: string;
}

export interface ProjectEventMarker {
  id: string;
  /** Plot position (ms). Local noon of the event date, clamped into the
   * plotted data range so a same-day event never falls off the chart edge. */
  ts: number;
  eventDate: string;
  title: string;
}

/** Local noon of a "YYYY-MM-DD" calendar date. Noon (not midnight) so the
 * marker stays on the intended local day regardless of DST shifts. */
export function eventDateToLocalNoon(eventDate: string): number {
  const [year, month, day] = eventDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

/** The local calendar day of a timestamp, as a sortable "YYYY-MM-DD" key. */
export function toLocalDateKey(ts: number): string {
  const date = new Date(ts);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Today's local calendar date — the default for the "log event" form. */
export function todayLocalDateKey(): string {
  return toLocalDateKey(Date.now());
}

/**
 * Markers for the events whose calendar date falls within the plotted data's
 * local-day range (inclusive on both ends — an event logged on the day of the
 * first or last check still counts). Returned sorted by plot position so the
 * events strip reads left-to-right like the chart.
 */
export function buildEventMarkers(
  events: readonly ProjectEventLike[],
  dataTimestamps: readonly number[],
): ProjectEventMarker[] {
  if (events.length === 0 || dataTimestamps.length === 0) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const ts of dataTimestamps) {
    if (ts < min) min = ts;
    if (ts > max) max = ts;
  }
  // Zero-padded ISO dates compare lexicographically = chronologically.
  const minKey = toLocalDateKey(min);
  const maxKey = toLocalDateKey(max);

  return events
    .filter((event) => event.eventDate >= minKey && event.eventDate <= maxKey)
    .map((event) => ({
      id: event.id,
      eventDate: event.eventDate,
      title: event.title,
      ts: Math.min(Math.max(eventDateToLocalNoon(event.eventDate), min), max),
    }))
    .toSorted((a, b) => a.ts - b.ts || a.eventDate.localeCompare(b.eventDate));
}

/** "Jun 3, 2026" — matches the chart tooltips' date style. */
export function formatEventDate(eventDate: string): string {
  return new Date(eventDateToLocalNoon(eventDate)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
