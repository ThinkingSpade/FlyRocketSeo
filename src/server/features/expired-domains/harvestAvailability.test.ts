import { describe, expect, it, vi } from "vitest";
import { refreshHarvestedAvailability } from "@/server/features/expired-domains/harvestAvailability";

const NOW = Date.parse("2026-08-21T12:00:00.000Z");

function row(input: {
  id: string;
  domain: string;
  isAvailable: boolean | null;
  checkedAt: string | null;
}) {
  return {
    id: input.id,
    domain: input.domain,
    isAvailable: input.isAvailable,
    availabilityCheckedAt: input.checkedAt,
  };
}

describe("refreshHarvestedAvailability", () => {
  it("deduplicates, skips fresh answers, and checks only project rows", async () => {
    const resolveAvailability = vi.fn().mockResolvedValue(true);
    const setAvailability = vi.fn().mockResolvedValue(undefined);
    const listForProject = vi.fn().mockResolvedValue([
      row({
        id: "fresh",
        domain: "fresh.com",
        isAvailable: true,
        checkedAt: "2026-08-21T11:00:00.000Z",
      }),
      row({
        id: "stale",
        domain: "stale.com",
        isAvailable: false,
        checkedAt: "2026-08-20T11:00:00.000Z",
      }),
    ]);

    const result = await refreshHarvestedAvailability(
      {
        projectId: "p1",
        domains: ["fresh.com", " STALE.COM ", "stale.com", "other.com"],
      },
      {
        listForProject,
        resolveAvailability,
        setAvailability,
        now: () => new Date(NOW),
      },
    );

    expect(listForProject).toHaveBeenCalledWith("p1");
    expect(resolveAvailability).toHaveBeenCalledTimes(1);
    expect(resolveAvailability).toHaveBeenCalledWith("stale.com");
    expect(setAvailability).toHaveBeenCalledWith(
      "stale",
      true,
      "2026-08-21T12:00:00.000Z",
    );
    expect(result).toEqual({ "stale.com": true });
  });

  it("keeps an unanswered lookup null and eligible for an explicit retry", async () => {
    const setAvailability = vi.fn().mockResolvedValue(undefined);

    const result = await refreshHarvestedAvailability(
      { projectId: "p1", domains: ["unknown.com"] },
      {
        listForProject: () =>
          Promise.resolve([
            row({
              id: "unknown",
              domain: "unknown.com",
              isAvailable: null,
              checkedAt: "2026-08-21T11:59:00.000Z",
            }),
          ]),
        resolveAvailability: () => Promise.reject(new Error("no answer")),
        setAvailability,
        now: () => new Date(NOW),
      },
    );

    expect(result).toEqual({ "unknown.com": null });
    expect(setAvailability).toHaveBeenCalledWith(
      "unknown",
      null,
      "2026-08-21T12:00:00.000Z",
    );
  });

  it("defensively caps a request at 25 paid lookups", async () => {
    const stored = Array.from({ length: 30 }, (_, index) =>
      row({
        id: `id-${index}`,
        domain: `domain${index}.com`,
        isAvailable: false,
        checkedAt: "2026-08-19T12:00:00.000Z",
      }),
    );
    const resolveAvailability = vi.fn().mockResolvedValue(false);

    await refreshHarvestedAvailability(
      { projectId: "p1", domains: stored.map((item) => item.domain) },
      {
        listForProject: () => Promise.resolve(stored),
        resolveAvailability,
        setAvailability: () => Promise.resolve(),
        now: () => new Date(NOW),
      },
    );

    expect(resolveAvailability).toHaveBeenCalledTimes(25);
  });
});
