import { describe, expect, it } from "vitest";
import { computeSerpStrength } from "./serpStrength";

describe("computeSerpStrength", () => {
  const results = [
    { rank: 1, domain: "big.com", domainEtv: 100_000 },
    { rank: 2, domain: "mid.com", domainEtv: 5_000 },
    { rank: 3, domain: "tiny.com", domainEtv: 200 },
    { rank: 11, domain: "page2.com", domainEtv: 9_999_999 },
  ];
  const ratings = {
    "big.com": 80,
    "mid.com": 45,
    "tiny.com": 12,
    "page2.com": 90,
  };

  it("averages DR, medians traffic, and finds the weakest top-10 slot", () => {
    const strength = computeSerpStrength(results, ratings);
    expect(strength.averageDr).toBe(Math.round((80 + 45 + 12) / 3));
    expect(strength.medianDomainTraffic).toBe(5_000);
    expect(strength.softSpots).toBe(1);
    expect(strength.weakest).toEqual({ rank: 3, domain: "tiny.com", dr: 12 });
    // Page-2 results never count toward the top-10 read.
  });

  it("handles missing ratings gracefully", () => {
    const strength = computeSerpStrength(results, null);
    expect(strength.averageDr).toBeNull();
    expect(strength.weakest).toBeNull();
    expect(strength.softSpots).toBe(0);
    expect(strength.medianDomainTraffic).toBe(5_000);
  });

  it("prefers the deeper slot when DR ties", () => {
    const strength = computeSerpStrength(
      [
        { rank: 2, domain: "a.com", domainEtv: null },
        { rank: 9, domain: "b.com", domainEtv: null },
      ],
      { "a.com": 20, "b.com": 20 },
    );
    expect(strength.weakest?.domain).toBe("b.com");
  });
});
