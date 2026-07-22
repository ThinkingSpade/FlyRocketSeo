import { describe, it, expect } from "vitest";
import { formatRunAge } from "./runAge";

const NOW = Date.parse("2026-07-22T12:00:00.000Z");

describe("formatRunAge", () => {
  it("reads as just now under a minute", () => {
    expect(formatRunAge("2026-07-22T11:59:30.000Z", NOW)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(formatRunAge("2026-07-22T11:20:00.000Z", NOW)).toBe("40m ago");
    expect(formatRunAge("2026-07-22T09:00:00.000Z", NOW)).toBe("3h ago");
    expect(formatRunAge("2026-07-19T12:00:00.000Z", NOW)).toBe("3d ago");
  });

  it("falls back to the date once it is over a month old", () => {
    expect(formatRunAge("2026-05-02T12:00:00.000Z", NOW)).toBe("2026-05-02");
  });

  it("returns null for an unparseable timestamp", () => {
    expect(formatRunAge("not-a-date", NOW)).toBeNull();
  });
});
