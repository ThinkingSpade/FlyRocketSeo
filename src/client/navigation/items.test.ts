import { describe, expect, it } from "vitest";
import { getProjectNavGroups, getProjectSidebarGroups } from "./items";

const destinations = [
  "",
  "/keywords",
  "/trends",
  "/serp",
  "/content",
  "/page",
  "/clusters",
  "/saved",
  "/rank-tracking",
  "/opportunities",
  "/search-performance",
  "/links",
  "/cannibalization",
  "/local-grid",
  "/domain",
  "/backlinks",
  "/expired-domains",
  "/competitors",
  "/audit",
  "/on-page",
  "/report",
  "/brand-lookup",
  "/prompt-explorer",
  "/local",
].map((suffix) => `/p/$projectId${suffix}`);

describe("workflow navigation", () => {
  it("shows fewer primary links while retaining every tool as a related destination", () => {
    const groups = getProjectSidebarGroups("project-a");
    const primary = groups.flatMap((group) => group.items);
    expect(primary.length).toBeLessThanOrEqual(12);
    const paths = groups.flatMap((group) =>
      [...group.items, ...group.relatedItems].map((item) => item.to),
    );
    expect(paths.toSorted()).toEqual(destinations.toSorted());
    expect(new Set(paths).size).toBe(24);
    expect(
      groups
        .flatMap((group) => group.relatedItems)
        .every((item) => item.params.projectId === "project-a"),
    ).toBe(true);
  });
  it("puts the overview and next actions before specialist research tools", () => {
    const groups = getProjectNavGroups("project-a");
    expect(groups.map((group) => group.label)).toEqual([
      "Overview",
      "Research",
      "Optimize",
      "Track",
      "Manage",
    ]);
    expect(groups[0].items.map((item) => item.to)).toEqual([
      "/p/$projectId",
      "/p/$projectId/opportunities",
    ]);
  });

  it("retains all 24 destinations exactly once without changing deep links", () => {
    const paths = getProjectNavGroups("project-a").flatMap((group) =>
      group.items.map((item) => item.to),
    );
    expect(paths.toSorted()).toEqual(destinations.toSorted());
    expect(new Set(paths).size).toBe(24);
  });

  it("builds every link with the selected project without leaking an earlier one", () => {
    for (const projectId of ["project-a", "project-b"]) {
      const items = getProjectNavGroups(projectId).flatMap(
        (group) => group.items,
      );
      expect(items.every((item) => item.params.projectId === projectId)).toBe(
        true,
      );
    }
  });
});
