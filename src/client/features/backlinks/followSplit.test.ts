import { describe, expect, it } from "vitest";
import {
  computeNofollowExposure,
  getNofollowSharePresentation,
} from "./followSplit";

describe("computeNofollowExposure", () => {
  it("declines a share from inconsistent, fractional or overflowing provider counts", () => {
    expect(computeNofollowExposure(5, 6)).toBeNull();
    expect(computeNofollowExposure(5.5, 1)).toBeNull();
    expect(computeNofollowExposure(Number.MAX_SAFE_INTEGER + 1, 1)).toBeNull();
    expect(computeNofollowExposure(5, 1.5)).toBeNull();
  });
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
    // It must not infer how much authority reaches the site. The field counts
    // domains TOUCHED by nofollow, and every one of them may also send a
    // followed link, in which case nothing is overstated at all.
    expect(exposure?.note).toContain("not nofollow-only");
    expect(exposure?.note).not.toMatch(/overstates/i);
  });

  it("flags a profile with almost no nofollow links", () => {
    expect(computeNofollowExposure(100, 1)?.verdict).toBe("unusually-clean");
  });

  it("treats a normal mix as healthy", () => {
    expect(computeNofollowExposure(100, 25)?.verdict).toBe("healthy");
  });

  it("keeps a nofollow count above the total unknown instead of manufacturing a full share", () => {
    expect(computeNofollowExposure(50, 80)).toBeNull();
  });

  it("rejects a negative nofollow count rather than inventing links", () => {
    expect(computeNofollowExposure(50, -5)).toBeNull();
  });
});

describe("getNofollowSharePresentation", () => {
  it("replaces a zero-share bar with the exact no-links message", () => {
    expect(getNofollowSharePresentation(0)).toEqual({
      kind: "message",
      headline: "No nofollow links reported",
      detail: null,
    });
  });

  it("replaces a full-share bar with the exact scope clarification", () => {
    expect(getNofollowSharePresentation(1)).toEqual({
      kind: "message",
      headline: "Every referring domain has at least one nofollow link",
      detail: "This does not mean every link is nofollow.",
    });
  });

  it("keeps a real split as a distribution", () => {
    expect(getNofollowSharePresentation(0.2)).toEqual({
      kind: "distribution",
    });
  });
});
