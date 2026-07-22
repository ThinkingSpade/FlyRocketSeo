import { describe, expect, it } from "vitest";
import { planMerge, type StoredRow } from "./mergeSuggestions";
import type { Suggestion } from "./suggestions";

const NOW = "2026-07-21T00:00:00.000Z";
let counter = 0;
const newId = () => `new-${(counter += 1)}`;

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    url: "https://x.com/a",
    element: "title",
    target: null,
    currentValue: "Old",
    suggestedValue: "New Title",
    reason: "because",
    ...overrides,
  };
}

function stored(overrides: Partial<StoredRow> = {}): StoredRow {
  return {
    id: "row-1",
    url: "https://x.com/a",
    element: "title",
    target: "",
    suggestedValue: "New Title",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("planMerge", () => {
  it("inserts fresh suggestions with new ids as pending", () => {
    const plan = planMerge([], [suggestion()], NOW, newId);
    expect(plan.added).toBe(1);
    expect(plan.kept).toBe(0);
    expect(plan.rows[0].isNew).toBe(true);
    expect(plan.rows[0].status).toBe("pending");
    expect(plan.rows[0].createdAt).toBe(NOW);
  });

  it("keeps rows distinct when their fields would run together", () => {
    // Concatenating url+element+target makes both of these
    // "https://x.com/atitletitle", so a naive key silently merges two
    // different suggestions and hands one of them the other's decision.
    const plan = planMerge(
      [
        stored({
          id: "row-a",
          url: "https://x.com/atitle",
          target: "",
          suggestedValue: "SA",
          status: "approved",
        }),
        stored({
          id: "row-b",
          url: "https://x.com/a",
          target: "title",
          suggestedValue: "SB",
          status: "excluded",
        }),
      ],
      [
        suggestion({
          url: "https://x.com/atitle",
          target: null,
          suggestedValue: "SA",
        }),
        suggestion({
          url: "https://x.com/a",
          target: "title",
          suggestedValue: "SB",
        }),
      ],
      NOW,
      newId,
    );

    expect(plan.rows[0].id).toBe("row-a");
    expect(plan.rows[0].status).toBe("approved");
    expect(plan.rows[1].id).toBe("row-b");
    expect(plan.rows[1].status).toBe("excluded");
    expect(plan.staleIds).toEqual([]);
  });

  it("preserves an approval when the wording is unchanged", () => {
    const plan = planMerge(
      [stored({ status: "approved" })],
      [suggestion({ suggestedValue: "New Title" })],
      NOW,
      newId,
    );
    expect(plan.kept).toBe(1);
    expect(plan.rows[0].status).toBe("approved");
    expect(plan.rows[0].id).toBe("row-1");
    // Carried-forward rows keep their original creation time.
    expect(plan.rows[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("preserves an exclusion when the wording is unchanged", () => {
    const plan = planMerge(
      [stored({ status: "excluded" })],
      [suggestion({ suggestedValue: "New Title" })],
      NOW,
      newId,
    );
    expect(plan.rows[0].status).toBe("excluded");
  });

  it("resets to pending when the suggested text changed", () => {
    const plan = planMerge(
      [stored({ status: "approved", suggestedValue: "New Title" })],
      [suggestion({ suggestedValue: "A Different Title" })],
      NOW,
      newId,
    );
    // The user never saw this wording, so a prior approval can't carry over.
    expect(plan.rows[0].status).toBe("pending");
    expect(plan.rows[0].id).toBe("row-1"); // same row, updated in place
  });

  it("marks stored rows the crawl no longer produces as stale", () => {
    const plan = planMerge(
      [
        stored({ id: "gone", url: "https://x.com/removed" }),
        stored({ id: "kept" }),
      ],
      [suggestion()],
      NOW,
      newId,
    );
    expect(plan.staleIds).toEqual(["gone"]);
  });

  it("treats a null target and an empty-string target as the same key", () => {
    const plan = planMerge(
      [stored({ status: "approved", target: "" })],
      [suggestion({ target: null })],
      NOW,
      newId,
    );
    expect(plan.kept).toBe(1);
    expect(plan.rows[0].status).toBe("approved");
    expect(plan.staleIds).toEqual([]);
  });

  it("keys alt suggestions by their image target", () => {
    const plan = planMerge(
      [
        stored({
          id: "img-a",
          element: "alt",
          target: "/img/a.jpg",
          status: "approved",
        }),
      ],
      [
        suggestion({
          element: "alt",
          target: "/img/a.jpg",
          suggestedValue: "New Title",
        }),
        suggestion({
          element: "alt",
          target: "/img/b.jpg",
          suggestedValue: "Other",
        }),
      ],
      NOW,
      newId,
    );
    const a = plan.rows.find((row) => row.target === "/img/a.jpg");
    const b = plan.rows.find((row) => row.target === "/img/b.jpg");
    expect(a?.status).toBe("approved");
    expect(a?.isNew).toBe(false);
    expect(b?.isNew).toBe(true);
  });
});
