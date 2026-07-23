import { describe, expect, it } from "vitest";
import { countLinksAtStake, findReclaimTargets } from "./brokenPageReclaim";

type Row = Parameters<typeof findReclaimTargets>[0][number];

function row(page: string | null, broken: number | null): Row {
  return {
    page,
    backlinks: 100,
    referringDomains: 20,
    rank: 30,
    brokenBacklinks: broken,
  };
}

describe("findReclaimTargets", () => {
  it("keeps only pages that actually have broken backlinks", () => {
    const targets = findReclaimTargets(
      [row("/a", 5), row("/b", 0), row("/c", null)],
      10,
    );

    expect(targets.map((target) => target.page)).toEqual(["/a"]);
  });

  it("ranks by links at stake, breaking ties on page for stable output", () => {
    const targets = findReclaimTargets(
      [row("/b", 3), row("/z", 9), row("/a", 3)],
      10,
    );

    expect(targets.map((target) => target.page)).toEqual(["/z", "/a", "/b"]);
  });

  it("drops rows with no page rather than rendering a blank target", () => {
    expect(findReclaimTargets([row(null, 12)], 10)).toEqual([]);
  });

  it("honours the limit", () => {
    const rows = [row("/a", 5), row("/b", 4), row("/c", 3)];

    expect(findReclaimTargets(rows, 2)).toHaveLength(2);
  });

  it("sums the links recoverable across targets", () => {
    const targets = findReclaimTargets([row("/a", 5), row("/b", 4)], 10);

    expect(countLinksAtStake(targets)).toBe(9);
  });
});
