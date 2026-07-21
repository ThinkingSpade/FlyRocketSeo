import { describe, expect, it } from "vitest";
import { computeTrendInsights } from "./trendsInsights";

const DAY_MS = 24 * 60 * 60 * 1000;
// Fixed anchor keeps month math deterministic: Dec 15, 2025 UTC.
const END = Date.UTC(2025, 11, 15);

/** Weekly series over ~12 months; value produced per point index. */
function weeklySeries(valueAt: (weeksAgo: number) => number | null) {
  const points = [];
  for (let weeksAgo = 52; weeksAgo >= 0; weeksAgo--) {
    points.push({
      timestamp: END - weeksAgo * 7 * DAY_MS,
      values: [valueAt(weeksAgo)],
    });
  }
  return points;
}

describe("computeTrendInsights", () => {
  it("flags rising momentum and computes YoY", () => {
    // 20 all year, jumping to 60 for the last ~12 weeks.
    const insights = computeTrendInsights(
      ["seo tools"],
      weeklySeries((weeksAgo) => (weeksAgo < 12 ? 60 : 20)),
    );

    const [insight] = insights;
    expect(insight.latest).toBe(60);
    expect(insight.momentum).toBe("rising");
    expect(insight.momentumPercent).toBeGreaterThan(100);
    // A year ago the value was 20 → +200%.
    expect(insight.yoyPercent).toBeCloseTo(200);
  });

  it("marks small drift as stable and finds seasonal peak/low months", () => {
    // Flat 50, except March (peak 90) and January (low 10) — both outside
    // the two 90-day momentum windows ending in December.
    const insights = computeTrendInsights(
      ["vending"],
      weeklySeries((weeksAgo) => {
        const month = new Date(END - weeksAgo * 7 * DAY_MS).getUTCMonth();
        if (month === 2) return 90;
        if (month === 0) return 10;
        return 50;
      }),
    );

    const [insight] = insights;
    expect(insight.momentum).toBe("stable");
    expect(insight.peakMonth).toBe(2);
    expect(insight.lowMonth).toBe(0);
  });

  it("returns nulls for sparse or short series", () => {
    const insights = computeTrendInsights(
      ["thin"],
      [
        { timestamp: END - 7 * DAY_MS, values: [30] },
        { timestamp: END, values: [40] },
      ],
    );
    const [insight] = insights;
    expect(insight.latest).toBe(40);
    expect(insight.momentum).toBeNull();
    expect(insight.yoyPercent).toBeNull();
    expect(insight.peakMonth).toBeNull();
  });

  it("skips null gaps in one keyword without affecting another", () => {
    const insights = computeTrendInsights(
      ["a", "b"],
      weeklySeries(() => 50).map((point, index) => ({
        ...point,
        values: [index % 2 === 0 ? null : 50, 50],
      })),
    );
    expect(insights[0].latest).toBe(50);
    expect(insights[1].momentum).toBe("stable");
  });
});
