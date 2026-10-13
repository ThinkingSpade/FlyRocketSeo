import { describe, it, expect } from "vitest";
import { toLinkBreakdown } from "./linkBreakdown";

describe("toLinkBreakdown", () => {
  it("drops invalid and overflowing counts rather than rounding them", () => {
    expect(
      toLinkBreakdown(
        {
          negative: -1,
          fractional: 1.5,
          overflow: Number.MAX_SAFE_INTEGER + 1,
          nonfinite: Number.POSITIVE_INFINITY,
          valid: 3,
        },
        5,
      ),
    ).toEqual([{ label: "valid", value: 3 }]);
  });
  it("sorts by count, biggest first", () => {
    expect(toLinkBreakdown({ NL: 8, BE: 1720, DE: 12 }, 5)).toEqual([
      { label: "BE", value: 1720 },
      { label: "DE", value: 12 },
      { label: "NL", value: 8 },
    ]);
  });

  it("caps to the requested number of entries", () => {
    const breakdown = toLinkBreakdown({ a: 5, b: 4, c: 3, d: 2 }, 2);
    expect(breakdown.map((row) => row.label)).toEqual(["a", "b"]);
  });

  it("drops entries with no usable count", () => {
    expect(
      toLinkBreakdown({ anchor: 10, image: null, redirect: 0 }, 5),
    ).toEqual([{ label: "anchor", value: 10 }]);
  });

  it("returns nothing when the field is absent", () => {
    expect(toLinkBreakdown(null, 5)).toEqual([]);
    expect(toLinkBreakdown(undefined, 5)).toEqual([]);
  });

  it("breaks ties by label so the order is stable", () => {
    expect(toLinkBreakdown({ b: 5, a: 5 }, 5).map((r) => r.label)).toEqual([
      "a",
      "b",
    ]);
  });
});
