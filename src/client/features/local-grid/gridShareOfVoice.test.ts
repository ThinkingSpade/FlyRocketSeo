import { describe, expect, it } from "vitest";
import { computeGridShareOfVoice } from "./gridShareOfVoice";

describe("computeGridShareOfVoice", () => {
  it("aggregates coverage, average position, and leaders across pins", () => {
    const result = computeGridShareOfVoice([
      { position: 2, topCompetitors: ["Acme", "Delio", "Best Vending"] },
      { position: 5, topCompetitors: ["Acme", "Best Vending", "Other Co"] },
      { position: null, topCompetitors: ["Acme", "Other Co", "Third Co"] },
    ]);

    expect(result.scannedPins).toBe(3);
    expect(result.myTop3Count).toBe(1);
    expect(result.myVisibleCount).toBe(2);
    expect(result.averagePosition).toBeCloseTo(3.5);

    expect(result.leaders[0]).toEqual({
      name: "Acme",
      appearances: 3,
      share: 1,
    });
    const names = result.leaders.map((leader) => leader.name);
    expect(names).toContain("Best Vending");
    expect(names).toContain("Delio");
  });

  it("counts a business once per pin even if listed twice", () => {
    const result = computeGridShareOfVoice([
      { position: null, topCompetitors: ["Acme", "Acme"] },
    ]);
    expect(result.leaders).toEqual([
      { name: "Acme", appearances: 1, share: 1 },
    ]);
  });

  it("handles an empty scan", () => {
    const result = computeGridShareOfVoice([]);
    expect(result).toEqual({
      scannedPins: 0,
      myTop3Count: 0,
      myVisibleCount: 0,
      averagePosition: null,
      leaders: [],
    });
  });
});
