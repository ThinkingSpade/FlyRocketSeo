import { describe, expect, it } from "vitest";
import { computeVisibilityTrend } from "./visibilityTrend";

const cell = (
  runId: string,
  checkedAt: string,
  trackingKeywordId: string,
  position: number | null,
) => ({ runId, checkedAt, trackingKeywordId, position });

describe("computeVisibilityTrend", () => {
  it("replays visibility per run, oldest first", () => {
    const volumes = new Map<string, number | null>([
      ["kw1", 1000],
      ["kw2", 0],
    ]);
    const points = computeVisibilityTrend(
      [
        cell("r2", "2026-07-15", "kw1", 1),
        cell("r1", "2026-07-01", "kw1", 10),
        cell("r1", "2026-07-01", "kw2", 2),
      ],
      volumes,
    );

    expect(points.map((p) => p.runId)).toEqual(["r1", "r2"]);
    // kw2 has zero volume, so only kw1 counts: pos 10 → CTR 0.021 of 0.28.
    expect(points[0].visibility).toBeCloseTo((0.021 / 0.28) * 100, 5);
    // Position 1 captures the full click potential.
    expect(points[1].visibility).toBeCloseTo(100, 5);
  });

  it("treats keywords missing from a run as not ranking", () => {
    const volumes = new Map<string, number | null>([
      ["kw1", 500],
      ["kw2", 500],
    ]);
    const points = computeVisibilityTrend(
      [cell("r1", "2026-07-01", "kw1", 1)],
      volumes,
    );
    // kw2 absent → contributes zero CTR: (500*0.28) / (1000*0.28) = 50%.
    expect(points[0].visibility).toBeCloseTo(50, 5);
  });

  it("returns null visibility when no keyword has volume", () => {
    const points = computeVisibilityTrend(
      [cell("r1", "2026-07-01", "kw1", 3)],
      new Map([["kw1", null]]),
    );
    expect(points[0].visibility).toBeNull();
  });

  it("handles an empty matrix", () => {
    expect(computeVisibilityTrend([], new Map())).toEqual([]);
  });
});
