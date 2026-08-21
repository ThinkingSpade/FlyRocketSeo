import { describe, expect, it, vi } from "vitest";
import { runManualDomainHarvest } from "@/server/features/expired-domains/manualDomainHarvest";

describe("runManualDomainHarvest", () => {
  it("does not resolve vocabulary when every recent date is already harvested", async () => {
    const resolveTerms = vi.fn().mockResolvedValue(["vending"]);
    const harvest = vi.fn(() =>
      Promise.resolve({
        matched: 0,
        harvestedRuns: [],
        skippedRuns: [],
        failedRuns: [],
      }),
    );

    const result = await runManualDomainHarvest({
      projectId: "p1",
      projectDomain: "example.com",
      competitorDomains: [],
      today: "2026-08-21",
      already: [
        "2026-08-20",
        "2026-08-19",
        "2026-08-18",
        "2026-08-17",
        "2026-08-16",
        "2026-08-15",
        "2026-08-14",
      ],
      resolveTerms,
      harvest,
    });

    expect(resolveTerms).not.toHaveBeenCalled();
    expect(harvest).not.toHaveBeenCalled();
    expect(result).toEqual({
      matched: 0,
      harvestedDates: [],
      skippedDates: [],
      failedDates: [],
      terms: [],
    });
  });

  it("reports harvested and permanently skipped dates separately", async () => {
    const result = await runManualDomainHarvest({
      projectId: "p1",
      projectDomain: "example.com",
      competitorDomains: [],
      today: "2026-08-21",
      already: [],
      resolveTerms: () => Promise.resolve(["vending"]),
      harvest: async (project) => {
        await project.terms();
        return {
          matched: 4,
          harvestedRuns: [],
          skippedRuns: [
            { projectId: project.projectId, droppedOn: project.droppedOn },
          ],
          failedRuns: [],
        };
      },
    });

    expect(result).toEqual({
      matched: 4,
      harvestedDates: [],
      skippedDates: ["2026-08-20"],
      failedDates: [],
      terms: ["vending"],
    });
  });
});
