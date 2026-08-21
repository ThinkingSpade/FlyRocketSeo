import { describe, expect, it } from "vitest";
import {
  formatHarvestAvailabilityAge,
  HARVEST_AVAILABILITY_RECHECK_MS,
  isHarvestAvailabilityDue,
  MAX_HARVEST_AVAILABILITY_BATCH,
  selectDueHarvestAvailabilityDomains,
} from "@/shared/harvestAvailability";

const NOW = Date.parse("2026-08-21T12:00:00.000Z");

function row(input: {
  domain: string;
  isAvailable?: boolean | null;
  availabilityCheckedAt?: string | null;
}) {
  return {
    domain: input.domain,
    isAvailable: input.isAvailable ?? null,
    availabilityCheckedAt: input.availabilityCheckedAt ?? null,
  };
}

describe("harvest availability re-check policy", () => {
  it("keeps null unknown and immediately eligible for an explicit retry", () => {
    expect(
      isHarvestAvailabilityDue(
        {
          isAvailable: null,
          availabilityCheckedAt: "2026-08-21T11:59:00.000Z",
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("treats an answered row as stale at the documented 24-hour boundary", () => {
    expect(HARVEST_AVAILABILITY_RECHECK_MS).toBe(24 * 60 * 60 * 1_000);
    expect(
      isHarvestAvailabilityDue(
        {
          isAvailable: false,
          availabilityCheckedAt: "2026-08-20T12:00:00.001Z",
        },
        NOW,
      ),
    ).toBe(false);
    expect(
      isHarvestAvailabilityDue(
        {
          isAvailable: false,
          availabilityCheckedAt: "2026-08-20T12:00:00.000Z",
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("treats missing or invalid timestamps as due rather than forever fresh", () => {
    expect(
      isHarvestAvailabilityDue(
        { isAvailable: true, availabilityCheckedAt: null },
        NOW,
      ),
    ).toBe(true);
    expect(
      isHarvestAvailabilityDue(
        { isAvailable: true, availabilityCheckedAt: "not-a-date" },
        NOW,
      ),
    ).toBe(true);
  });

  it("selects due rows in display order and skips fresh answers", () => {
    expect(
      selectDueHarvestAvailabilityDomains(
        [
          row({
            domain: "fresh.com",
            isAvailable: true,
            availabilityCheckedAt: "2026-08-20T12:01:00.000Z",
          }),
          row({
            domain: "unknown.com",
            availabilityCheckedAt: "2026-08-21T11:59:00.000Z",
          }),
          row({ domain: "missing-time.com", isAvailable: false }),
          row({
            domain: "stale.com",
            isAvailable: true,
            availabilityCheckedAt: "2026-08-20T12:00:00.000Z",
          }),
        ],
        NOW,
      ),
    ).toEqual(["unknown.com", "missing-time.com", "stale.com"]);
  });

  it("deduplicates normalized domains and never returns more than 25", () => {
    const rows = [
      row({ domain: " Example.com " }),
      row({ domain: "EXAMPLE.COM" }),
      ...Array.from({ length: 30 }, (_, index) =>
        row({ domain: `due-${index}.com` }),
      ),
    ];

    const selected = selectDueHarvestAvailabilityDomains(rows, NOW);

    expect(selected).toHaveLength(MAX_HARVEST_AVAILABILITY_BATCH);
    expect(selected[0]).toBe("example.com");
    expect(selected.filter((domain) => domain === "example.com")).toHaveLength(
      1,
    );
    expect(selected.at(-1)).toBe("due-23.com");
  });
});

describe("formatHarvestAvailabilityAge", () => {
  it("formats deterministic check ages", () => {
    expect(formatHarvestAvailabilityAge("2026-08-21T11:59:30.000Z", NOW)).toBe(
      "just now",
    );
    expect(formatHarvestAvailabilityAge("2026-08-21T11:20:00.000Z", NOW)).toBe(
      "40m ago",
    );
    expect(formatHarvestAvailabilityAge("2026-08-21T09:00:00.000Z", NOW)).toBe(
      "3h ago",
    );
    expect(formatHarvestAvailabilityAge("2026-08-18T12:00:00.000Z", NOW)).toBe(
      "3d ago",
    );
  });

  it("omits absent or invalid timestamps", () => {
    expect(formatHarvestAvailabilityAge(null, NOW)).toBeNull();
    expect(formatHarvestAvailabilityAge("not-a-date", NOW)).toBeNull();
  });
});
