import { describe, expect, it } from "vitest";
import { scoreCannibalization } from "./cannibalizationSeverity";

function row(
  query: string,
  totalClicks: number,
  totalImpressions: number,
  pageClicks: number[],
  pageImpressions?: number[],
) {
  return {
    query,
    totalClicks,
    totalImpressions,
    pages: pageClicks.map((clicks, index) => ({
      clicks,
      impressions: pageImpressions?.[index] ?? clicks * 10,
    })),
  };
}

describe("scoreCannibalization", () => {
  it("scores even splits on big queries as high and sorts them first", () => {
    const scored = scoreCannibalization([
      row("mild", 20, 500, [19, 1]),
      row("bad split", 40, 1000, [22, 18]),
    ]);

    expect(scored[0].query).toBe("bad split");
    expect(scored[0].severity).toBe("high");
    expect(scored[0].splitShare).toBeCloseTo(1 - 22 / 40);
    // The leader takes 95% of clicks — barely a split.
    expect(scored[1].severity).toBe("low");
  });

  it("falls back to impressions when the query has no clicks", () => {
    const scored = scoreCannibalization([
      row("zero clicks", 0, 400, [0, 0], [220, 180]),
    ]);
    expect(scored[0].splitShare).toBeCloseTo(1 - 220 / 400);
    expect(scored[0].severity).toBe("high");
  });

  it("marks moderate splits as medium", () => {
    const scored = scoreCannibalization([row("mid", 10, 150, [7, 3])]);
    expect(scored[0].severity).toBe("medium");
  });

  it("handles empty input", () => {
    expect(scoreCannibalization([])).toEqual([]);
  });
});
