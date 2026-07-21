import { describe, expect, it } from "vitest";
import { estimateTrafficShare } from "./serpTrafficShare";

describe("estimateTrafficShare", () => {
  it("returns null without a usable search volume", () => {
    expect(estimateTrafficShare(null, [1, 2])).toBeNull();
    expect(estimateTrafficShare(0, [1, 2])).toBeNull();
  });

  it("estimates clicks from the CTR curve and scales bars to the top result", () => {
    const estimates = estimateTrafficShare(1000, [1, 2, 15, null]);
    expect(estimates).not.toBeNull();
    expect(estimates!.get(1)).toEqual({ clicks: 270, relative: 1 });
    expect(estimates!.get(2)!.clicks).toBe(150);
    expect(estimates!.get(2)!.relative).toBeCloseTo(150 / 270);
    // Deep positions fall into the long-tail bucket.
    expect(estimates!.get(15)!.clicks).toBe(10);
    expect(estimates!.has(21)).toBe(false);
  });

  it("gives positions beyond 20 zero clicks", () => {
    const estimates = estimateTrafficShare(1000, [25]);
    expect(estimates!.get(25)).toEqual({ clicks: 0, relative: 0 });
  });
});
