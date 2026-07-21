import { describe, expect, it } from "vitest";
import { buildGrid, rankBucket, roundCoord } from "./gridGeo";

describe("buildGrid", () => {
  it("builds an n×n grid centered on the input point", () => {
    const center = { lat: 32.7767, lng: -96.797 };
    const grid = buildGrid(center, 5, 3);

    expect(grid).toHaveLength(9);
    // Middle pin is the center itself.
    expect(grid[4]).toEqual({
      lat: roundCoord(center.lat),
      lng: roundCoord(center.lng),
    });
    // Top row sits north (higher latitude), bottom row south.
    expect(grid[0].lat).toBeGreaterThan(grid[8].lat);
    // Left column sits west (lower longitude) of the right column.
    expect(grid[0].lng).toBeLessThan(grid[2].lng);
    // 5 miles ≈ 0.0725° of latitude.
    expect(grid[0].lat - center.lat).toBeCloseTo(5 / 69, 3);
  });

  it("handles the degenerate 1×1 grid", () => {
    expect(buildGrid({ lat: 10, lng: 20 }, 5, 1)).toEqual([
      { lat: 10, lng: 20 },
    ]);
  });
});

describe("rankBucket", () => {
  it("buckets ranks into pin colors", () => {
    expect(rankBucket(1)).toBe("top");
    expect(rankBucket(3)).toBe("top");
    expect(rankBucket(4)).toBe("page1");
    expect(rankBucket(10)).toBe("page1");
    expect(rankBucket(11)).toBe("deep");
    expect(rankBucket(null)).toBe("absent");
  });
});
