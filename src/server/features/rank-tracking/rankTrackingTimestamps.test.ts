import { afterEach, describe, expect, it, vi } from "vitest";
import {
  toSqliteTimestamp,
  toStoredTimestamp,
} from "@/server/features/rank-tracking/rankTrackingTimestamps";

const provider = vi.hoisted(() => ({ current: "d1" as "d1" | "postgres" }));

vi.mock("@/db/provider", () => ({
  getDatabaseProvider: () => provider.current,
}));

afterEach(() => {
  provider.current = "d1";
});

/**
 * The two backends store timestamps in DIFFERENT text formats, and the app
 * compares them as strings.
 *
 *   D1        `sql`(current_timestamp)``  ->  "2026-07-22 10:00:00"
 *   Postgres  `isoNow`                    ->  "2026-07-22T10:00:00.000Z"
 *
 * Character comparison sorts "T" (0x54) above a space (0x20), so a SQLite-shaped
 * cutoff compared against ISO rows rejects every row on the cutoff date whatever
 * its time. On Postgres that silently made rank comparisons read an older
 * snapshot and report the wrong delta.
 */
describe("toStoredTimestamp", () => {
  it("formats for D1 the way current_timestamp does", () => {
    expect(toStoredTimestamp(new Date("2026-07-22T10:00:00.000Z"))).toBe(
      "2026-07-22 10:00:00",
    );
  });

  it("formats for Postgres the way isoNow does", () => {
    provider.current = "postgres";
    expect(toStoredTimestamp(new Date("2026-07-22T10:00:00.000Z"))).toBe(
      "2026-07-22T10:00:00.000Z",
    );
  });

  it("orders correctly against same-day rows on each backend", () => {
    // The actual failure: a cutoff at 12:00 must include a 10:00 row from the
    // same day. With the SQLite format applied to ISO rows it did not.
    const row = "2026-07-22T10:00:00.000Z";
    const cutoffSqliteShaped = toStoredTimestamp(
      new Date("2026-07-22T12:00:00.000Z"),
    );
    expect(row <= cutoffSqliteShaped).toBe(false); // the bug, reproduced

    provider.current = "postgres";
    const cutoffIsoShaped = toStoredTimestamp(
      new Date("2026-07-22T12:00:00.000Z"),
    );
    expect(row <= cutoffIsoShaped).toBe(true); // fixed
  });

  it("still sorts lexicographically within each format", () => {
    const earlier = toStoredTimestamp(new Date("2026-07-22T09:59:59.000Z"));
    const later = toStoredTimestamp(new Date("2026-07-22T10:00:00.000Z"));
    expect(earlier < later).toBe(true);

    provider.current = "postgres";
    const earlierIso = toStoredTimestamp(new Date("2026-07-22T09:59:59.000Z"));
    const laterIso = toStoredTimestamp(new Date("2026-07-22T10:00:00.000Z"));
    expect(earlierIso < laterIso).toBe(true);
  });
});

describe("toSqliteTimestamp", () => {
  it("remains available for D1-only call paths", () => {
    // Kept so a caller that genuinely means "the SQLite format" says so, rather
    // than reaching for the provider-aware helper and getting ISO by surprise.
    expect(toSqliteTimestamp(new Date("2026-06-09T12:34:56.789Z"))).toBe(
      "2026-06-09 12:34:56",
    );
  });
});
