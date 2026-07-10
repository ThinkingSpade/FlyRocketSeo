import { describe, expect, it } from "vitest";
import {
  buildEventMarkers,
  eventDateToLocalNoon,
  toLocalDateKey,
} from "./projectEventMarkers";

const event = (id: string, eventDate: string) => ({
  id,
  eventDate,
  title: `Event ${id}`,
});

describe("eventDateToLocalNoon", () => {
  it("round-trips back to the same local calendar day", () => {
    expect(toLocalDateKey(eventDateToLocalNoon("2026-06-03"))).toBe(
      "2026-06-03",
    );
    // Zero-padded single digits survive the round trip too.
    expect(toLocalDateKey(eventDateToLocalNoon("2026-01-09"))).toBe(
      "2026-01-09",
    );
  });
});

describe("buildEventMarkers", () => {
  const jun1 = new Date(2026, 5, 1, 9, 30).getTime();
  const jun10 = new Date(2026, 5, 10, 17, 45).getTime();

  it("returns nothing without events or data points", () => {
    expect(buildEventMarkers([], [jun1, jun10])).toEqual([]);
    expect(buildEventMarkers([event("a", "2026-06-03")], [])).toEqual([]);
  });

  it("keeps events inside the plotted day range and drops the rest", () => {
    const markers = buildEventMarkers(
      [
        event("before", "2026-05-20"),
        event("inside", "2026-06-05"),
        event("after", "2026-06-11"),
      ],
      [jun1, jun10],
    );
    expect(markers.map((m) => m.id)).toEqual(["inside"]);
  });

  it("includes events on the first and last plotted day (inclusive bounds)", () => {
    const markers = buildEventMarkers(
      [event("first", "2026-06-01"), event("last", "2026-06-10")],
      [jun1, jun10],
    );
    expect(markers.map((m) => m.id)).toEqual(["first", "last"]);
  });

  it("clamps same-day markers into the data range so they stay drawable", () => {
    // First check ran 09:30; the event's noon anchor (12:00) is inside range so
    // it is untouched, while the last day's noon anchor (before the 17:45
    // check) is also inside. Use a single-point range to force clamping.
    const lone = new Date(2026, 5, 4, 8, 0).getTime();
    const markers = buildEventMarkers([event("a", "2026-06-04")], [lone]);
    expect(markers).toHaveLength(1);
    expect(markers[0].ts).toBe(lone);
  });

  it("sorts markers chronologically regardless of input order", () => {
    const markers = buildEventMarkers(
      [event("late", "2026-06-08"), event("early", "2026-06-02")],
      [jun1, jun10],
    );
    expect(markers.map((m) => m.id)).toEqual(["early", "late"]);
  });
});
