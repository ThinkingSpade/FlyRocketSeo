import { describe, expect, it, vi } from "vitest";
import {
  datesToHarvest,
  harvestDroppedDomains,
  MAX_MATCHES_PER_DAY,
} from "@/server/features/expired-domains/domainHarvest";

describe("datesToHarvest", () => {
  const TODAY = "2026-08-21";

  it("skips today, whose file does not exist until 03:00 UTC tomorrow", () => {
    expect(
      datesToHarvest({ today: TODAY, already: [], maxDays: 3 }),
    ).not.toContain(TODAY);
  });

  it("returns the most recent unharvested days, newest first", () => {
    expect(datesToHarvest({ today: TODAY, already: [], maxDays: 3 })).toEqual([
      "2026-08-20",
      "2026-08-19",
      "2026-08-18",
    ]);
  });

  // Re-pulling a day already stored would burn a 2 MB download to insert
  // nothing, because the unique index rejects every row.
  it("skips days already harvested", () => {
    expect(
      datesToHarvest({
        today: TODAY,
        already: ["2026-08-20", "2026-08-19"],
        maxDays: 3,
      }),
    ).toEqual(["2026-08-18"]);
  });

  it("returns nothing when everything recent is already harvested", () => {
    expect(
      datesToHarvest({
        today: TODAY,
        already: ["2026-08-20", "2026-08-19", "2026-08-18"],
        maxDays: 3,
      }),
    ).toEqual([]);
  });
});

describe("harvestDroppedDomains", () => {
  const BASE = {
    projectId: "p1",
    terms: ["vending", "coffee", "snack"],
    exclude: ["deliotx.com"],
  };

  it("stores only the domains that match the vocabulary", async () => {
    const inserted: Array<{ domain: string; matchedTerm: string }> = [];

    await harvestDroppedDomains({
      ...BASE,
      dates: ["2026-08-19"],
      fetchDropped: () =>
        Promise.resolve([
          "swindonvending.com",
          "randomthing.com",
          "murocoffee.com",
        ]),
      insertMatches: (rows) => {
        inserted.push(...rows);
        return Promise.resolve();
      },
    });

    expect(inserted.map((row) => row.domain)).toEqual([
      "swindonvending.com",
      "murocoffee.com",
    ]);
    expect(inserted[0]?.matchedTerm).toBe("vending");
  });

  it("tags each row with the date it dropped", async () => {
    const inserted: Array<{ droppedOn: string }> = [];
    await harvestDroppedDomains({
      ...BASE,
      dates: ["2026-08-19"],
      fetchDropped: () => Promise.resolve(["a-vending.com"]),
      insertMatches: (rows) => {
        inserted.push(...rows);
        return Promise.resolve();
      },
    });

    expect(inserted[0]?.droppedOn).toBe("2026-08-19");
  });

  // One bad day must not abort a backfill of several.
  it("continues to the next day when one download fails", async () => {
    const inserted: string[] = [];
    const result = await harvestDroppedDomains({
      ...BASE,
      dates: ["2026-08-19", "2026-08-18"],
      fetchDropped: (date: string) =>
        date === "2026-08-19"
          ? Promise.reject(new Error("UPSTREAM_UNAVAILABLE"))
          : Promise.resolve(["good-vending.com"]),
      insertMatches: (rows) => {
        inserted.push(...rows.map((row) => row.domain));
        return Promise.resolve();
      },
    });

    expect(inserted).toEqual(["good-vending.com"]);
    expect(result.failedDates).toEqual(["2026-08-19"]);
    expect(result.harvestedDates).toEqual(["2026-08-18"]);
  });

  it("caps how many matches one day may contribute", async () => {
    const many = Array.from(
      { length: MAX_MATCHES_PER_DAY + 50 },
      (_, i) => `vending${i}.com`,
    );
    let count = 0;

    await harvestDroppedDomains({
      ...BASE,
      dates: ["2026-08-19"],
      fetchDropped: () => Promise.resolve(many),
      insertMatches: (rows) => {
        count += rows.length;
        return Promise.resolve();
      },
    });

    expect(count).toBe(MAX_MATCHES_PER_DAY);
  });

  it("does nothing at all when there are no dates to pull", async () => {
    const fetchDropped = vi.fn();
    const result = await harvestDroppedDomains({
      ...BASE,
      dates: [],
      fetchDropped,
      insertMatches: vi.fn(),
    });

    expect(fetchDropped).not.toHaveBeenCalled();
    expect(result.matched).toBe(0);
  });

  it("does not call out when the project has no vocabulary", async () => {
    const fetchDropped = vi.fn();
    await harvestDroppedDomains({
      ...BASE,
      terms: [],
      dates: ["2026-08-19"],
      fetchDropped,
      insertMatches: vi.fn(),
    });

    expect(fetchDropped).not.toHaveBeenCalled();
  });
});
