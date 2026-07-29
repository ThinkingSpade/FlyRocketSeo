import { describe, expect, it } from "vitest";
import { computeFollowSplit } from "./followSplit";

describe("computeFollowSplit", () => {
  it("returns null when the total is missing or zero", () => {
    expect(computeFollowSplit(null, 10)).toBeNull();
    expect(computeFollowSplit(0, 0)).toBeNull();
  });

  it("returns null when the nofollow count is missing", () => {
    expect(computeFollowSplit(100, null)).toBeNull();
  });

  it("subtracts nofollow from the total to get dofollow", () => {
    const split = computeFollowSplit(310, 62);
    expect(split).not.toBeNull();
    expect(split?.dofollow).toBe(248);
    expect(split?.nofollow).toBe(62);
    expect(split?.total).toBe(310);
    expect(split?.dofollowShare).toBeCloseTo(0.8, 5);
  });

  it("calls a majority-nofollow profile out as nofollow-heavy", () => {
    const split = computeFollowSplit(100, 70);
    expect(split?.verdict).toBe("nofollow-heavy");
    expect(split?.note).toContain("30%");
  });

  it("flags a profile with almost no nofollow links", () => {
    expect(computeFollowSplit(100, 1)?.verdict).toBe("unusually-clean");
  });

  it("treats a normal mix as healthy", () => {
    expect(computeFollowSplit(100, 25)?.verdict).toBe("healthy");
  });

  it("clamps a nofollow count that exceeds the total", () => {
    const split = computeFollowSplit(50, 80);
    expect(split?.dofollow).toBe(0);
    expect(split?.nofollow).toBe(50);
    expect(split?.dofollowShare).toBe(0);
  });

  it("rejects a negative nofollow count rather than inventing links", () => {
    expect(computeFollowSplit(50, -5)).toBeNull();
  });
});
