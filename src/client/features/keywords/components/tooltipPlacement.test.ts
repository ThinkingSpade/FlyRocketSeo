import { describe, expect, it } from "vitest";
import { placeTooltip } from "./tooltipPlacement";

describe("viewport-safe tooltip placement", () => {
  const anchor = { top: 160, bottom: 180, center: 200 };
  it("positions readable help above the trigger when space permits", () => {
    expect(
      placeTooltip(
        anchor,
        { width: 240, height: 60 },
        { width: 390, height: 800 },
      ),
    ).toEqual({ left: 80, top: 92 });
  });
  it("clamps help at the left viewport edge", () => {
    expect(
      placeTooltip(
        { ...anchor, center: 15 },
        { width: 240, height: 60 },
        { width: 390, height: 800 },
      ).left,
    ).toBe(8);
  });
  it("clamps help at the right viewport edge", () => {
    expect(
      placeTooltip(
        { ...anchor, center: 380 },
        { width: 240, height: 60 },
        { width: 390, height: 800 },
      ).left,
    ).toBe(142);
  });
  it("flips below a trigger too close to the top", () => {
    expect(
      placeTooltip(
        { ...anchor, top: 16, bottom: 36 },
        { width: 240, height: 60 },
        { width: 390, height: 800 },
      ).top,
    ).toBe(44);
  });
});
