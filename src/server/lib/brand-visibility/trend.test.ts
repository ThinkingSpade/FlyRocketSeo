import { describe, it, expect } from "vitest";
import { buildTrend, type TrendInputRow } from "./trend";

function row(overrides: Partial<TrendInputRow> = {}): TrendInputRow {
  return {
    capturedOn: "2026-07-01",
    totalMentions: 100,
    chatgptMentions: 60,
    googleMentions: 40,
    targetSharePct: 30,
    ...overrides,
  };
}

describe("buildTrend", () => {
  it("orders the series oldest to newest regardless of input order", () => {
    const trend = buildTrend([
      row({ capturedOn: "2026-07-10" }),
      row({ capturedOn: "2026-07-01" }),
      row({ capturedOn: "2026-07-05" }),
    ]);
    expect(trend.series.map((p) => p.capturedOn)).toEqual([
      "2026-07-01",
      "2026-07-05",
      "2026-07-10",
    ]);
    expect(trend.latest?.capturedOn).toBe("2026-07-10");
  });

  it("computes the delta between the two most recent snapshots", () => {
    const trend = buildTrend([
      row({ capturedOn: "2026-07-01", totalMentions: 100, targetSharePct: 30 }),
      row({ capturedOn: "2026-07-08", totalMentions: 140, targetSharePct: 45 }),
    ]);
    expect(trend.delta).not.toBeNull();
    expect(trend.delta?.totalMentions).toBe(40);
    expect(trend.delta?.targetSharePct).toBe(15);
    expect(trend.delta?.previousCapturedOn).toBe("2026-07-01");
  });

  it("has no delta with fewer than two snapshots", () => {
    expect(buildTrend([row()]).delta).toBeNull();
    expect(buildTrend([]).delta).toBeNull();
  });

  it("leaves a delta metric null when either side is missing", () => {
    const trend = buildTrend([
      row({ capturedOn: "2026-07-01", totalMentions: null, targetSharePct: 30 }),
      row({ capturedOn: "2026-07-08", totalMentions: 140, targetSharePct: 45 }),
    ]);
    expect(trend.delta?.totalMentions).toBeNull();
    expect(trend.delta?.targetSharePct).toBe(15);
  });

  it("returns empty series and null latest for no snapshots", () => {
    const trend = buildTrend([]);
    expect(trend.series).toEqual([]);
    expect(trend.latest).toBeNull();
  });
});
