import { describe, expect, it } from "vitest";
import { createProjectEventSchema } from "./project-events";

const base = { projectId: "p1", title: "Published pillar page" };

describe("createProjectEventSchema", () => {
  it("accepts a real calendar date and trims the title", () => {
    const parsed = createProjectEventSchema.parse({
      ...base,
      title: "  Published pillar page  ",
      eventDate: "2026-06-15",
    });
    expect(parsed.title).toBe("Published pillar page");
    expect(parsed.eventDate).toBe("2026-06-15");
    expect(parsed.note).toBeUndefined();
  });

  it("rejects malformed and impossible dates", () => {
    for (const eventDate of [
      "2026-6-15", // not zero-padded
      "15-06-2026", // wrong order
      "2026-02-31", // impossible day (Date.UTC would roll it into March)
      "2026-13-01", // impossible month
      "yesterday",
    ]) {
      expect(
        createProjectEventSchema.safeParse({ ...base, eventDate }).success,
        eventDate,
      ).toBe(false);
    }
  });

  it("turns a whitespace-only note into undefined", () => {
    const parsed = createProjectEventSchema.parse({
      ...base,
      eventDate: "2026-06-15",
      note: "   ",
    });
    expect(parsed.note).toBeUndefined();
  });

  it("rejects an empty title", () => {
    expect(
      createProjectEventSchema.safeParse({
        ...base,
        title: "   ",
        eventDate: "2026-06-15",
      }).success,
    ).toBe(false);
  });
});
