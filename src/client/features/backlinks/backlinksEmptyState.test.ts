import { describe, expect, it } from "vitest";
import { resolveBacklinksEmptyState } from "./backlinksEmptyState";

const base = { hasCategoryFilter: false, hasManualFilter: false, page: 1 };

describe("empty results table", () => {
  it("does not blame a filter when none is set", () => {
    // The table used to say "No backlinks match this filter" unconditionally,
    // which described a filter the user had never applied.
    expect(resolveBacklinksEmptyState(base)).toEqual({
      title: "No backlinks found for this target",
      actions: [],
    });
  });

  it("explains a drill-down that returned nothing without inventing a reason", () => {
    const state = resolveBacklinksEmptyState({
      ...base,
      hasCategoryFilter: true,
    });

    expect(state.title).toBe("No matching links in the table");
    expect(state.description).toContain("measured across the whole profile");
    // Neither applies on this page: web requests disable spam filtering, and a
    // drill-down forces All links, so there is no deduplication either.
    expect(state.description).not.toContain("spam");
    expect(state.description).not.toContain("duplicate");
  });

  it("prefers the drill-down explanation over the generic filter one", () => {
    const state = resolveBacklinksEmptyState({
      hasCategoryFilter: true,
      hasManualFilter: true,
      page: 1,
    });

    expect(state.title).toBe("No matching links in the table");
  });

  it("names the filters when only manual ones are set", () => {
    expect(
      resolveBacklinksEmptyState({ ...base, hasManualFilter: true }),
    ).toEqual({
      title: "No backlinks match these filters",
      actions: ["clear-filters"],
    });
  });

  it("reports an overshot page as such", () => {
    expect(resolveBacklinksEmptyState({ ...base, page: 4 })).toEqual({
      title: "No results on page 4",
      actions: ["previous-page"],
    });
  });

  it("always offers a way back when paged past the end, whatever the cause", () => {
    // Otherwise a filtered result on page 3 is a dead end: the message explains
    // the filter but leaves no route back to rows that do exist.
    const state = resolveBacklinksEmptyState({
      hasCategoryFilter: true,
      hasManualFilter: false,
      page: 3,
    });

    expect(state.actions).toEqual(["clear-filters", "previous-page"]);
  });
});
