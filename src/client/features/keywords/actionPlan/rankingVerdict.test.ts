import { describe, expect, it } from "vitest";
import { assessRanking, rankingVerdictLabel } from "./rankingVerdict";

// deliotx.com's real DR, the figure the keyword-research summary card shows.
const OWN_DR = 26;

describe("assessRanking", () => {
  it("calls a SERP winnable when three or more rated pages are within reach", () => {
    const result = assessRanking({
      ownDomainRating: OWN_DR,
      competitorRatings: [12, 20, 25, 78, 91, 60, 55, 44, 33, 88],
    });
    expect(result.verdict).toBe("winnable");
    expect(result.reachableCount).toBe(3);
    expect(result.reason).toContain("DR 26");
  });

  it("counts a competitor within the tolerance band as reachable", () => {
    // DR 31 is 5 above 26 -- inside the band, because DR is a log-scaled
    // estimate and treating 31 as unbeatable by 26 would be false precision.
    const result = assessRanking({
      ownDomainRating: OWN_DR,
      competitorRatings: [31, 31, 31, 90, 90],
    });
    expect(result.verdict).toBe("winnable");
    expect(result.reachableCount).toBe(3);
  });

  it("excludes a competitor just outside the tolerance band", () => {
    const result = assessRanking({
      ownDomainRating: OWN_DR,
      competitorRatings: [32, 32, 32, 90, 90],
    });
    expect(result.verdict).toBe("unlikely");
    expect(result.reachableCount).toBe(0);
  });

  it("calls it a stretch when only one or two pages are reachable", () => {
    const result = assessRanking({
      ownDomainRating: OWN_DR,
      competitorRatings: [20, 80, 85, 91, 77],
    });
    expect(result.verdict).toBe("stretch");
    expect(result.reachableCount).toBe(1);
  });

  it("calls it unlikely when nothing on the page is beatable", () => {
    const result = assessRanking({
      ownDomainRating: OWN_DR,
      competitorRatings: [80, 85, 91, 77, 95],
    });
    expect(result.verdict).toBe("unlikely");
    expect(result.reason).toContain("longer-tail");
  });

  it("is not dragged to unlikely by one giant result", () => {
    // The whole reason this counts reachable pages instead of averaging:
    // a mean DR here is 40+, but six beatable pages is an open SERP.
    const result = assessRanking({
      ownDomainRating: OWN_DR,
      competitorRatings: [10, 12, 14, 16, 18, 20, 100, 100, 100, 100],
    });
    expect(result.verdict).toBe("winnable");
    expect(result.reachableCount).toBe(6);
  });

  it("says so when the project's own DR is unknown", () => {
    const result = assessRanking({
      ownDomainRating: null,
      competitorRatings: [10, 20, 30],
    });
    expect(result.verdict).toBe("unknown");
    expect(result.reason).toContain("domain rating for this project");
  });

  it("says so when no competitor DR could be read", () => {
    const result = assessRanking({
      ownDomainRating: OWN_DR,
      competitorRatings: [null, null, null],
    });
    expect(result.verdict).toBe("unknown");
    expect(result.ratedCount).toBe(0);
  });

  it("ignores unrated competitors rather than assuming a value for them", () => {
    const result = assessRanking({
      ownDomainRating: OWN_DR,
      competitorRatings: [10, null, 12, null, 14],
    });
    expect(result.ratedCount).toBe(3);
    expect(result.reachableCount).toBe(3);
    expect(result.verdict).toBe("winnable");
  });

  it("treats a DR 0 project as real, not missing", () => {
    // A brand-new site genuinely has DR 0; that must produce a verdict, not
    // the "we don't know your DR" branch.
    const result = assessRanking({
      ownDomainRating: 0,
      competitorRatings: [1, 2, 3, 90],
    });
    expect(result.verdict).toBe("winnable");
  });
});

describe("rankingVerdictLabel", () => {
  it("gives each verdict a short human label", () => {
    expect(rankingVerdictLabel("winnable")).toBe("Winnable");
    expect(rankingVerdictLabel("stretch")).toBe("A stretch");
    expect(rankingVerdictLabel("unlikely")).toBe("Not yet");
    expect(rankingVerdictLabel("unknown")).toBe("Can't tell");
  });
});
