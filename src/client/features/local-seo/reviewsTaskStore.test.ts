import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearReviewsTask,
  loadReviewsTask,
  saveReviewsTask,
} from "./reviewsTaskStore";

const DAY_MS = 24 * 60 * 60 * 1000;

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
});

describe("reviews task store", () => {
  const task = { taskId: "task-1", startedAt: 1_000_000 };

  it("returns a saved task so a remount can resume the free poll", () => {
    saveReviewsTask("proj-a", "Acme Plumbing", task);
    expect(loadReviewsTask("proj-a", "Acme Plumbing", task.startedAt)).toEqual(
      task,
    );
  });

  it("keeps tasks separate per project", () => {
    saveReviewsTask("proj-a", "Acme Plumbing", task);
    expect(
      loadReviewsTask("proj-b", "Acme Plumbing", task.startedAt),
    ).toBeNull();
  });

  it("keeps tasks separate per business", () => {
    saveReviewsTask("proj-a", "Acme Plumbing", task);
    expect(
      loadReviewsTask("proj-a", "Other Business", task.startedAt),
    ).toBeNull();
  });

  // The keyword arrives from a text input, so the same business typed with
  // different casing or padding must not post a second billed task.
  it("treats a keyword as the same business regardless of case and padding", () => {
    saveReviewsTask("proj-a", "Acme Plumbing", task);
    expect(
      loadReviewsTask("proj-a", "  acme plumbing  ", task.startedAt),
    ).toEqual(task);
  });

  it("drops a task older than the replay window", () => {
    saveReviewsTask("proj-a", "Acme Plumbing", task);
    const wayLater = task.startedAt + 8 * DAY_MS;
    expect(loadReviewsTask("proj-a", "Acme Plumbing", wayLater)).toBeNull();
    // And forgets it, so the next read does not re-parse a dead entry.
    expect(
      localStorage.getItem("local-reviews-task:proj-a:acme plumbing"),
    ).toBe(null);
  });

  it("keeps a task that is inside the replay window", () => {
    saveReviewsTask("proj-a", "Acme Plumbing", task);
    const soonAfter = task.startedAt + 6 * DAY_MS;
    expect(loadReviewsTask("proj-a", "Acme Plumbing", soonAfter)).toEqual(task);
  });

  // A backwards clock jump would otherwise make `startedAt` look like the
  // future, which no elapsed-time check can ever expire.
  it("rejects a task stamped in the future", () => {
    saveReviewsTask("proj-a", "Acme Plumbing", task);
    expect(
      loadReviewsTask("proj-a", "Acme Plumbing", task.startedAt - 1),
    ).toBeNull();
  });

  it("returns null for malformed stored values rather than throwing", () => {
    localStorage.setItem("local-reviews-task:proj-a:acme plumbing", "{oops");
    expect(loadReviewsTask("proj-a", "Acme Plumbing")).toBeNull();

    localStorage.setItem(
      "local-reviews-task:proj-a:acme plumbing",
      JSON.stringify({ taskId: "", startedAt: 1 }),
    );
    expect(loadReviewsTask("proj-a", "Acme Plumbing")).toBeNull();

    localStorage.setItem(
      "local-reviews-task:proj-a:acme plumbing",
      JSON.stringify({ taskId: "ok" }),
    );
    expect(loadReviewsTask("proj-a", "Acme Plumbing")).toBeNull();
  });

  it("clears on request", () => {
    saveReviewsTask("proj-a", "Acme Plumbing", task);
    clearReviewsTask("proj-a", "Acme Plumbing");
    expect(
      loadReviewsTask("proj-a", "Acme Plumbing", task.startedAt),
    ).toBeNull();
  });

  it("survives storage being unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => saveReviewsTask("proj-a", "Acme", task)).not.toThrow();
    expect(loadReviewsTask("proj-a", "Acme")).toBeNull();
    expect(() => clearReviewsTask("proj-a", "Acme")).not.toThrow();
  });
});
