import { describe, expect, it } from "vitest";
import {
  computeDomainQuality,
  filterPositiveQualityBuckets,
} from "./domainQuality";

const ranks = (values: Array<number | null>) =>
  values.map((rank) => ({ rank }));

describe("computeDomainQuality", () => {
  it("returns null when nothing carries a rank", () => {
    expect(computeDomainQuality([])).toBeNull();
    expect(computeDomainQuality(ranks([null, null]))).toBeNull();
  });

  it("excludes unranked rows from the denominator", () => {
    const quality = computeDomainQuality(ranks([50, null, 60]));
    expect(quality?.ranked).toBe(2);
  });

  it("places ranks in the right buckets", () => {
    const quality = computeDomainQuality(ranks([5, 15, 35, 95]));
    const byLabel = Object.fromEntries(
      quality!.buckets.map((b) => [b.label, b.domains]),
    );
    expect(byLabel["0-10"]).toBe(1);
    expect(byLabel["11-20"]).toBe(1);
    expect(byLabel["31-40"]).toBe(1);
    expect(byLabel["71+"]).toBe(1);
  });

  it("puts bucket boundaries in exactly one bucket", () => {
    const quality = computeDomainQuality(ranks([10, 11, 20, 21]));
    const byLabel = Object.fromEntries(
      quality!.buckets.map((b) => [b.label, b.domains]),
    );
    expect(byLabel["0-10"]).toBe(1);
    expect(byLabel["11-20"]).toBe(2);
    expect(byLabel["21-30"]).toBe(1);
    expect(quality!.buckets.reduce((sum, b) => sum + b.domains, 0)).toBe(4);
  });

  it("counts authority 30 itself as strong, matching the label", () => {
    const quality = computeDomainQuality(ranks([29, 30, 31, 80]));
    expect(quality?.strongDomains).toBe(3);
    expect(quality?.strongShare).toBeCloseTo(0.75, 5);
  });

  it("takes the median of an odd-length set", () => {
    expect(computeDomainQuality(ranks([10, 20, 90]))?.medianRank).toBe(20);
  });

  it("averages the middle pair for an even-length set", () => {
    expect(computeDomainQuality(ranks([10, 20, 30, 40]))?.medianRank).toBe(25);
  });

  it("shares always sum to one", () => {
    const quality = computeDomainQuality(ranks([1, 25, 45, 65, 85]));
    const total = quality!.buckets.reduce((sum, b) => sum + b.share, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("says so plainly when nothing reaches authority 30", () => {
    expect(computeDomainQuality(ranks([5, 8, 12]))?.note).toContain("None");
  });

  it("reports the distribution without judging it strong or normal", () => {
    // "Unusually strong" needs a comparison set for this niche, which we do not
    // have, and domain authority describes the referring domain's own profile rather than the
    // weight of the link pointing here. The note states the share and stops.
    const note = computeDomainQuality(ranks([60, 70, 80]))?.note ?? "";
    expect(note).toContain("100%");
    expect(note).not.toMatch(/unusually strong|little weight|normal mix/i);
    expect(computeDomainQuality(ranks([60, 70, 80]))?.note).toContain(
      "domain authority 30",
    );
  });
});

describe("filterPositiveQualityBuckets", () => {
  it("removes zero buckets while preserving positive buckets", () => {
    expect(
      filterPositiveQualityBuckets([
        { label: "0-10", domains: 0 },
        { label: "11-20", domains: 2 },
        { label: "21-30", domains: 0 },
      ]),
    ).toEqual([{ label: "11-20", domains: 2 }]);
  });

  it("returns no rows for an all-zero breakdown", () => {
    expect(
      filterPositiveQualityBuckets([
        { label: "0-10", domains: 0 },
        { label: "11-20", domains: 0 },
      ]),
    ).toEqual([]);
  });
});
