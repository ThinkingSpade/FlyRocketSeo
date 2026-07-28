import { describe, expect, it } from "vitest";
import { resolvePrefill } from "./resolvePrefill";

const NOTHING = {
  searchParam: null,
  handoff: null,
  lastRun: null,
  suggestions: [],
  projectDefault: null,
  kind: "keyword" as const,
};

describe("resolvePrefill", () => {
  it("falls through to nothing when every source is empty", () => {
    expect(resolvePrefill(NOTHING)).toEqual({ value: "", source: "none" });
  });

  it("prefers the search param above everything", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        searchParam: "explicit",
        handoff: { kind: "keyword", value: "carried", source: "serp", at: 1 },
        lastRun: "previous",
        suggestions: [{ value: "suggested", hint: "h", weight: 1 }],
        projectDefault: "project",
      }),
    ).toEqual({ value: "explicit", source: "search-param" });
  });

  it("prefers the handoff over the last run", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        handoff: { kind: "keyword", value: "carried", source: "serp", at: 1 },
        lastRun: "previous",
      }),
    ).toEqual({ value: "carried", source: "handoff" });
  });

  it("skips a handoff whose kind does not match the field", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        kind: "keyword",
        handoff: { kind: "domain", value: "example.com", source: "d", at: 1 },
        lastRun: "previous",
      }),
    ).toEqual({ value: "previous", source: "last-run" });
  });

  it("prefers the last run over a suggestion", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        lastRun: "previous",
        suggestions: [{ value: "suggested", hint: "h", weight: 1 }],
      }),
    ).toEqual({ value: "previous", source: "last-run" });
  });

  it("prefers the top suggestion over the project default", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        suggestions: [
          { value: "best", hint: "h", weight: 9 },
          { value: "second", hint: "h", weight: 1 },
        ],
        projectDefault: "project",
      }),
    ).toEqual({ value: "best", source: "suggestion" });
  });

  it("uses the project default last", () => {
    expect(
      resolvePrefill({ ...NOTHING, projectDefault: "example.com" }),
    ).toEqual({
      value: "example.com",
      source: "project",
    });
  });

  it("treats a blank string as absent", () => {
    expect(
      resolvePrefill({
        ...NOTHING,
        searchParam: "   ",
        projectDefault: "example.com",
      }),
    ).toEqual({ value: "example.com", source: "project" });
  });
});
