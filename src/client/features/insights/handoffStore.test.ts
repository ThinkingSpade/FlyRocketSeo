import { beforeEach, describe, expect, it, vi } from "vitest";
import { HANDOFF_TTL_MS, readHandoff, writeHandoff } from "./handoffStore";

// The store is sessionStorage-backed; `environment: "node"` has no DOM, so
// stand up the minimal surface the store actually touches.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

beforeEach(() => {
  const storage = new MemoryStorage();
  vi.stubGlobal("window", {
    sessionStorage: storage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  });
});

describe("handoffStore", () => {
  it("returns null when nothing was written", () => {
    expect(readHandoff("p1")).toBeNull();
  });

  it("round-trips an entry", () => {
    writeHandoff("p1", {
      kind: "keyword",
      value: "office coffee",
      source: "serp",
      at: 1000,
    });

    expect(readHandoff("p1", 1000)).toEqual({
      kind: "keyword",
      value: "office coffee",
      source: "serp",
      at: 1000,
    });
  });

  it("scopes entries per project", () => {
    writeHandoff("p1", {
      kind: "keyword",
      value: "one",
      source: "serp",
      at: 1000,
    });

    expect(readHandoff("p2", 1000)).toBeNull();
  });

  it("expires an entry past the TTL", () => {
    writeHandoff("p1", {
      kind: "keyword",
      value: "stale",
      source: "serp",
      at: 1000,
    });

    expect(readHandoff("p1", 1000 + HANDOFF_TTL_MS + 1)).toBeNull();
  });

  it("keeps an entry exactly at the TTL boundary", () => {
    writeHandoff("p1", {
      kind: "keyword",
      value: "fresh",
      source: "serp",
      at: 1000,
    });

    expect(readHandoff("p1", 1000 + HANDOFF_TTL_MS)?.value).toBe("fresh");
  });

  it("treats corrupt storage as empty", () => {
    window.sessionStorage.setItem("insights-handoff:p1", "{not json");

    expect(readHandoff("p1")).toBeNull();
  });

  it("ignores an entry missing required fields", () => {
    window.sessionStorage.setItem(
      "insights-handoff:p1",
      JSON.stringify({ kind: "keyword", at: 1000 }),
    );

    expect(readHandoff("p1", 1000)).toBeNull();
  });

  it("rejects an unknown kind", () => {
    window.sessionStorage.setItem(
      "insights-handoff:p1",
      JSON.stringify({ kind: "wat", value: "x", source: "s", at: 1000 }),
    );

    expect(readHandoff("p1", 1000)).toBeNull();
  });
});
