import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readProjectKeywordLocation,
  writeProjectKeywordLocation,
} from "./preferredKeywordLocationStore";
const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("keyword market persistence", () => {
  it("keeps a chosen paid-research market within its project", () => {
    writeProjectKeywordLocation("project-a", 2826);
    expect(readProjectKeywordLocation("project-a")).toBe(2826);
    expect(readProjectKeywordLocation("project-b")).toBeNull();
  });
  it("does not assign unscoped legacy market choices to a new project", () => {
    values.set("keyword-preferred-location", "2826");
    expect(readProjectKeywordLocation("project-a")).toBeNull();
  });
  it("ignores malformed or unsupported saved markets", () => {
    values.set("keyword-preferred-location:project-a", "null");
    expect(readProjectKeywordLocation("project-a")).toBeNull();
    writeProjectKeywordLocation("project-a", -1);
    expect(readProjectKeywordLocation("project-a")).toBeNull();
  });
});
