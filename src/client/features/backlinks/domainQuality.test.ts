import { describe, expect, it } from "vitest";
import { computeDomainQuality } from "./domainQuality";

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

  it("counts DR 30+ as strong, exclusive of 30 itself", () => {
    const quality = computeDomainQuality(ranks([29, 30, 31, 80]));
    expect(quality?.strongDomains).toBe(2);
    expect(quality?.strongShare).toBeCloseTo(0.5, 5);
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

  it("says so plainly when nothing reaches DR 30", () => {
    expect(computeDomainQuality(ranks([5, 8, 12]))?.note).toContain("None");
  });

  it("calls a high-authority profile unusually strong", () => {
    expect(computeDomainQuality(ranks([60, 70, 80]))?.note).toContain(
      "unusually strong",
    );
  });
});
