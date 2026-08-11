import { describe, expect, it } from "vitest";
import { classifyNumericSeries } from "./backlinksChartInformation";

describe("classifyNumericSeries", () => {
  it("classifies an empty array as insufficient", () => {
    expect(classifyNumericSeries([])).toEqual({ kind: "insufficient" });
  });

  it("classifies an all-null series as all-null", () => {
    expect(classifyNumericSeries([null, null])).toEqual({ kind: "all-null" });
  });

  it("classifies two or more zeroes as all-zero", () => {
    expect(classifyNumericSeries([0, null, 0])).toEqual({ kind: "all-zero" });
  });

  it("classifies a constant nonzero series with its value", () => {
    expect(classifyNumericSeries([38, null, 38])).toEqual({
      kind: "constant",
      value: 38,
    });
  });

  it("classifies one finite point as insufficient", () => {
    expect(
      classifyNumericSeries([Number.NaN, 7, Number.POSITIVE_INFINITY]),
    ).toEqual({ kind: "insufficient" });
  });

  it("classifies two or more varying points as varying", () => {
    expect(classifyNumericSeries([5, null, 8])).toEqual({ kind: "varying" });
  });
});
