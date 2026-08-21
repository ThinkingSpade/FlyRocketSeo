import { describe, expect, it } from "vitest";
import {
  HARVEST_TICKS_PER_HOUR,
  scheduledUnitForTick,
} from "@/shared/cronDispatch";

const at = (minute: number) => new Date(Date.UTC(2026, 7, 21, 9, minute, 0, 0));

describe("scheduledUnitForTick", () => {
  // The whole point: two jobs in one invocation can exhaust the 50-query
  // Free-plan budget, so no tick may ever be claimed by both.
  it("gives every tick to exactly one unit", () => {
    for (const minute of [0, 15, 30, 45]) {
      const unit = scheduledUnitForTick(at(minute));
      expect(unit === "rank-checks" || unit === "domain-harvest").toBe(true);
    }
  });

  it("runs rank checks on the top of the hour only", () => {
    expect(scheduledUnitForTick(at(0))).toBe("rank-checks");
    expect(scheduledUnitForTick(at(15))).toBe("domain-harvest");
    expect(scheduledUnitForTick(at(30))).toBe("domain-harvest");
    expect(scheduledUnitForTick(at(45))).toBe("domain-harvest");
  });

  it("leaves the harvest the stated share of the hour", () => {
    const harvestTicks = [0, 15, 30, 45].filter(
      (m) => scheduledUnitForTick(at(m)) === "domain-harvest",
    );

    expect(harvestTicks).toHaveLength(HARVEST_TICKS_PER_HOUR);
  });

  // A tick that drifts a few seconds must not change hands.
  it("classifies by the minute, not the second", () => {
    expect(
      scheduledUnitForTick(new Date(Date.UTC(2026, 7, 21, 9, 14, 59))),
    ).toBe("rank-checks");
    expect(
      scheduledUnitForTick(new Date(Date.UTC(2026, 7, 21, 9, 15, 1))),
    ).toBe("domain-harvest");
  });
});
