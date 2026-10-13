import { describe, expect, it } from "vitest";
import { getProjectNavGroups } from "./items";

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
