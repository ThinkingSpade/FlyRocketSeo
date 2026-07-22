import { describe, expect, it } from "vitest";
import {
  aiRewritableIds,
  elementProgress,
  groupByPage,
  pendingIds,
  summarize,
  toPath,
  type FixRow,
} from "./onPageModel";

function fix(overrides: Partial<FixRow> = {}): FixRow {
  return {
    id: "1",
    url: "https://x.com/a",
    element: "title",
    target: "",
    currentValue: "Old",
    suggestedValue: "New",
    reason: "because",
    source: "rules",
    status: "pending",
    ...overrides,
  };
}

describe("toPath", () => {
  it("strips the domain", () => {
    expect(toPath("https://x.com/blog/post?ref=1")).toBe("/blog/post?ref=1");
  });
  it("passes through non-URLs", () => {
    expect(toPath("/already/a/path")).toBe("/already/a/path");
  });
});

describe("elementProgress", () => {
  it("counts per element in display order, omitting empty ones", () => {
    const progress = elementProgress([
      fix({ id: "1", element: "title", status: "approved" }),
      fix({ id: "2", element: "title", status: "pending" }),
      fix({ id: "3", element: "alt", status: "excluded" }),
    ]);
    expect(progress.map((p) => p.element)).toEqual(["title", "alt"]);
    const titles = progress.find((p) => p.element === "title");
    expect(titles).toMatchObject({ total: 2, approved: 1, pending: 1 });
  });
});

describe("summarize", () => {
  it("computes completion over actionable (non-excluded) rows", () => {
    const summary = summarize([
      fix({ id: "1", status: "approved" }),
      fix({ id: "2", status: "approved" }),
      fix({ id: "3", status: "pending" }),
      fix({ id: "4", status: "excluded" }),
    ]);
    expect(summary).toMatchObject({
      total: 4,
      approved: 2,
      pending: 1,
      excluded: 1,
    });
    // 2 approved of 3 actionable.
    expect(summary.completion).toBeCloseTo(2 / 3);
  });

  it("is 0% completion with nothing approved and safe when all excluded", () => {
    expect(summarize([fix({ status: "pending" })]).completion).toBe(0);
    expect(summarize([fix({ status: "excluded" })]).completion).toBe(0);
    expect(summarize([]).completion).toBe(0);
  });
});

describe("groupByPage", () => {
  const rows = [
    fix({ id: "a1", url: "https://x.com/a", element: "title", status: "pending" }),
    fix({ id: "a2", url: "https://x.com/a", element: "alt", status: "pending" }),
    fix({ id: "b1", url: "https://x.com/b", element: "meta", status: "approved" }),
  ];

  it("groups by url and orders pages by pending count", () => {
    const groups = groupByPage(rows);
    expect(groups.map((g) => g.path)).toEqual(["/a", "/b"]);
    expect(groups[0].pendingCount).toBe(2);
  });

  it("orders rows within a page by element", () => {
    const groups = groupByPage(rows);
    expect(groups[0].rows.map((r) => r.element)).toEqual(["title", "alt"]);
  });

  it("filters by status when asked", () => {
    const groups = groupByPage(rows, "approved");
    expect(groups).toHaveLength(1);
    expect(groups[0].path).toBe("/b");
  });
});

describe("id selectors", () => {
  const rows = [
    fix({ id: "t", element: "title", status: "pending" }),
    fix({ id: "m", element: "meta", status: "pending" }),
    fix({ id: "h", element: "h1", status: "pending" }),
    fix({ id: "a", element: "alt", status: "pending" }),
    fix({ id: "done", element: "title", status: "approved" }),
  ];

  it("pendingIds returns every pending row", () => {
    expect(pendingIds(rows).sort()).toEqual(["a", "h", "m", "t"]);
  });

  it("aiRewritableIds returns only pending title/meta", () => {
    expect(aiRewritableIds(rows).sort()).toEqual(["m", "t"]);
  });
});
