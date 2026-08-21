import { describe, expect, it } from "vitest";
import { partitionHarvestRunDates } from "@/server/features/expired-domains/harvestRunDates";

describe("partitionHarvestRunDates", () => {
  it("keeps completed harvests separate from permanent skips", () => {
    expect(
      partitionHarvestRunDates([
        { droppedOn: "2026-08-20", skipReason: null },
        {
          droppedOn: "2026-08-19",
          skipReason: "WHOISFREAKS_SUBSCRIPTION_WINDOW",
        },
      ]),
    ).toEqual({
      harvestedDates: ["2026-08-20"],
      skippedDates: ["2026-08-19"],
    });
  });
});
