import { describe, expect, it } from "vitest";
import { buildSparklinePath } from "./trendSparklinePath";

function point(month: number, searchVolume: number, year = 2026) {
  return { year, month, searchVolume };
}

describe("buildSparklinePath", () => {
  it("returns null for fewer than two points", () => {
    expect(buildSparklinePath([], 64, 22)).toBeNull();
    expect(buildSparklinePath([point(1, 10)], 64, 22)).toBeNull();
  });

  it("scales min to the bottom and max to the top across the width", () => {
    const path = buildSparklinePath(
      [point(1, 0), point(2, 100), point(3, 50)],
      60,
      22,
    );
    expect(path).not.toBeNull();
    // Three points across a 60px box: x = 0, 30, 60.
    expect(path!.line).toBe("M0,20.5 L30,1.5 L60,11");
    // Area closes to the baseline and back to the origin.
    expect(path!.area).toBe("M0,20.5 L30,1.5 L60,11 L60,22 L0,22 Z");
  });

  it("sorts by year-month and keeps only the last 12 points", () => {
    const months = Array.from({ length: 15 }, (_, index) =>
      point(index + 1, index, 2025),
    );
    const shuffled = months.toReversed();
    const path = buildSparklinePath(shuffled, 66, 22);
    // 12 points → 11 segments of 6px each.
    expect(path!.line.startsWith("M0,")).toBe(true);
    expect(path!.line.match(/L/g)).toHaveLength(11);
  });

  it("draws a midline for a flat series instead of hugging an edge", () => {
    const path = buildSparklinePath([point(1, 50), point(2, 50)], 40, 22);
    expect(path!.line).toBe("M0,11 L40,11");
  });
});
