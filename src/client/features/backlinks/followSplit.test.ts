import { describe, expect, it } from "vitest";
import { computeNofollowExposure } from "./followSplit";

describe("computeNofollowExposure", () => {
  it("returns null when the total is missing or zero", () => {
    expect(computeNofollowExposure(null, 10)).toBeNull();
    expect(computeNofollowExposure(0, 0)).toBeNull();
  });

  it("returns null when the nofollow count is missing", () => {
    expect(computeNofollowExposure(100, null)).toBeNull();
  });

  it("reports the nofollow share of referring domains", () => {
    const exposure = computeNofollowExposure(310, 62);
    expect(exposure?.nofollow).toBe(62);
    expect(exposure?.total).toBe(310);
    expect(exposure?.nofollowShare).toBeCloseTo(0.2, 5);
  });

  it("treats domains with no nofollow link as a floor, not a dofollow total", () => {
    // DataForSEO counts a domain in `referring_domains_nofollow` if *any* of
    // its links is nofollow, so the remainder is the domains known to be
    // nofollow-free — not the domains that pass authority.
    expect(computeNofollowExposure(100, 70)?.cleanDofollow).toBe(30);
  });

  it("calls a majority-nofollow profile out as nofollow-heavy", () => {
    const exposure = computeNofollowExposure(100, 70);
    expect(exposure?.verdict).toBe("nofollow-heavy");
    expect(exposure?.note).toContain("70%");
    // It must not claim the other 30 are the only ones passing authority.
    expect(exposure?.note).toContain("also send dofollow");
  });

  it("flags a profile with almost no nofollow links", () => {
    expect(computeNofollowExposure(100, 1)?.verdict).toBe("unusually-clean");
  });

  it("treats a normal mix as healthy", () => {
    expect(computeNofollowExposure(100, 25)?.verdict).toBe("healthy");
  });

  it("clamps a nofollow count that exceeds the total", () => {
    const exposure = computeNofollowExposure(50, 80);
    expect(exposure?.nofollow).toBe(50);
    expect(exposure?.cleanDofollow).toBe(0);
    expect(exposure?.nofollowShare).toBe(1);
  });

  it("rejects a negative nofollow count rather than inventing links", () => {
    expect(computeNofollowExposure(50, -5)).toBeNull();
  });
});
