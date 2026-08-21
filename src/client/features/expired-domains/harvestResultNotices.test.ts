import { describe, expect, it } from "vitest";
import { describeHarvestResult } from "@/client/features/expired-domains/harvestResultNotices";

describe("describeHarvestResult", () => {
  it("presents a permanent skip separately instead of calling it harvested", () => {
    expect(
      describeHarvestResult({
        matched: 0,
        harvestedDates: [],
        skippedDates: ["2026-08-19"],
        failedDates: [],
      }),
    ).toEqual([
      {
        kind: "info",
        message:
          "Skipped 2026-08-19 — outside the active feed subscription window.",
      },
    ]);
  });

  it("does not add an up-to-date success after a failed pull", () => {
    expect(
      describeHarvestResult({
        matched: 0,
        harvestedDates: [],
        skippedDates: [],
        failedDates: ["2026-08-20"],
      }),
    ).toEqual([{ kind: "error", message: "Could not pull 2026-08-20." }]);
  });

  it("reports a real harvest and its match count", () => {
    expect(
      describeHarvestResult({
        matched: 12,
        harvestedDates: ["2026-08-20"],
        skippedDates: [],
        failedDates: [],
      }),
    ).toEqual([
      {
        kind: "success",
        message: "Harvested 2026-08-20 — 12 matches.",
      },
    ]);
  });
});
