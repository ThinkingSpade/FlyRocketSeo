import { describe, expect, it } from "vitest";
import {
  computePageRealEstate,
  computePositionBuckets,
  computeStrikingDistance,
  computeTrafficConcentration,
  type PageKeyword,
} from "./pageInsights";

function kw(
  keyword: string,
  position: number | null,
  searchVolume: number | null = null,
  traffic: number | null = null,
): PageKeyword {
  return { keyword, position, searchVolume, traffic };
}

describe("computePositionBuckets", () => {
  it("buckets keywords by position and skips unranked", () => {
    expect(
      computePositionBuckets([
        kw("a", 1),
        kw("b", 3),
        kw("c", 7),
        kw("d", 15),
        kw("e", 30),
        kw("f", 80),
        kw("g", null),
      ]),
    ).toEqual({
      top3: 2,
      pos4to10: 1,
      pos11to20: 1,
      pos21to50: 1,
      pos51plus: 1,
    });
  });
});

describe("computePageRealEstate", () => {
  it("counts #1s, top-3s, top-10s, and striking distance", () => {
    expect(
      computePageRealEstate([
        kw("a", 1),
        kw("b", 2),
        kw("c", 9),
        kw("d", 12),
        kw("e", 40),
      ]),
    ).toEqual({ numberOne: 1, top3: 2, top10: 3, strikingDistance: 2 });
  });
});

describe("computeTrafficConcentration", () => {
  it("ranks top keywords by traffic with shares of the page total", () => {
    const result = computeTrafficConcentration(
      [kw("big", 1, 1000, 600), kw("mid", 2, 500, 300), kw("zero", 5, 10, 0)],
      1000,
    );
    expect(result).not.toBeNull();
    expect(result!.rows.map((row) => row.keyword)).toEqual(["big", "mid"]);
    expect(result!.rows[0].share).toBeCloseTo(0.6);
    expect(result!.topShare).toBeCloseTo(0.9);
  });

  it("returns null without traffic", () => {
    expect(computeTrafficConcentration([kw("a", 1)], 0)).toBeNull();
    expect(computeTrafficConcentration([kw("a", 1, 10, 0)], 100)).toBeNull();
  });

  it("caps the combined share at 100%", () => {
    const result = computeTrafficConcentration([kw("a", 1, 10, 150)], 100);
    expect(result!.topShare).toBe(1);
  });
});

describe("computeStrikingDistance", () => {
  it("keeps positions 4-15 sorted by volume", () => {
    const rows = computeStrikingDistance([
      kw("first", 1, 9000),
      kw("close", 5, 100),
      kw("closer", 11, 400),
      kw("far", 25, 800),
    ]);
    expect(rows.map((row) => row.keyword)).toEqual(["closer", "close"]);
  });
});
