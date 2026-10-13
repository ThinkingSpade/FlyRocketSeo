import { describe, expect, it } from "vitest";
import { computeLinkVelocity } from "./linkVelocity";

type Trend = Parameters<typeof computeLinkVelocity>[0][number];

function month(newRd: number, lostRd: number, date = "2026-01-01"): Trend {
  return {
    date,
    newReferringDomains: newRd,
    lostReferringDomains: lostRd,
    newBacklinks: 0,
    lostBacklinks: 0,
  };
}

describe("computeLinkVelocity", () => {
  it("returns null with no trend data", () => {
    expect(computeLinkVelocity([])).toBeNull();
  });

  it("averages gains and losses across the window", () => {
    const velocity = computeLinkVelocity([month(10, 2), month(20, 4)]);

    expect(velocity?.months).toBe(2);
    expect(velocity?.gainedPerMonth).toBe(15);
    expect(velocity?.lostPerMonth).toBe(3);
    expect(velocity?.netPerMonth).toBe(12);
    expect(velocity?.direction).toBe("growing");
  });

  it("reports shrinking when losses outweigh gains", () => {
    const velocity = computeLinkVelocity([month(2, 10), month(3, 12)]);

    expect(velocity?.netPerMonth).toBeLessThan(0);
    expect(velocity?.direction).toBe("shrinking");
  });

  // A site winning 40 and losing 38 a month is treading water; calling that
  // "growing" off the raw new-links count is the thing this guards against.
  it("calls near-parity flat even when raw gains are large", () => {
    const velocity = computeLinkVelocity([month(40, 38), month(41, 41)]);

    expect(velocity?.gainedPerMonth).toBeGreaterThan(40);
    expect(velocity?.direction).toBe("flat");
  });

  it("exposes the most recent month separately from the average", () => {
    const velocity = computeLinkVelocity([month(10, 0), month(1, 9)]);

    expect(velocity?.latestNet).toBe(-8);
    expect(velocity?.netPerMonth).toBe(1);
  });

  it("does not call missing monthly evidence flat or include it as zero movement", () => {
    const unknown = { ...month(0, 0), newReferringDomains: null };
    expect(computeLinkVelocity([unknown])).toBeNull();
    expect(computeLinkVelocity([month(10, 2), unknown])).toBeNull();
    expect(
      computeLinkVelocity([{ ...month(0, 0), lostReferringDomains: null }]),
    ).toBeNull();
  });

  it("keeps an observed zero month as real evidence", () => {
    expect(computeLinkVelocity([month(0, 0)])).toMatchObject({
      months: 1,
      netPerMonth: 0,
      latestNet: 0,
      direction: "flat",
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0.5])(
    "does not derive velocity from invalid referring-domain counts (%s)",
    (count) => {
      expect(computeLinkVelocity([month(count, 0)])).toBeNull();
      expect(computeLinkVelocity([month(0, count)])).toBeNull();
    },
  );

  it("does not derive a plausible average when event totals overflow exact integers", () => {
    expect(
      computeLinkVelocity([month(Number.MAX_SAFE_INTEGER, 0), month(1, 0)]),
    ).toBeNull();
    expect(
      computeLinkVelocity([month(0, Number.MAX_SAFE_INTEGER), month(0, 1)]),
    ).toBeNull();
  });
});
