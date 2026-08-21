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
    recordRun: () => Promise.resolve(),
  };

  it("stores only the domains that match the vocabulary", async () => {
    const inserted: Array<{ domain: string; matchedTerm: string }> = [];

    await harvestDroppedDomains({
      ...BASE,
      dates: ["2026-08-19"],
      streamDropped: (_date, onDomain) => {
        for (const d of [
          "swindonvending.com",
          "randomthing.com",
          "murocoffee.com",
        ]) {
          if (!onDomain(d)) break;
        }
        return Promise.resolve();
      },
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
      streamDropped: (_date, onDomain) => {
        onDomain("a-vending.com");
        return Promise.resolve();
      },
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
      streamDropped: (date, onDomain) => {
        if (date === "2026-08-19") {
          return Promise.reject(new Error("UPSTREAM_UNAVAILABLE"));
        }
        onDomain("good-vending.com");
        return Promise.resolve();
      },
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
      streamDropped: (_date, onDomain) => {
        for (const d of many) {
          if (!onDomain(d)) break;
        }
        return Promise.resolve();
      },
      insertMatches: (rows) => {
        count += rows.length;
        return Promise.resolve();
      },
    });

    expect(count).toBe(MAX_MATCHES_PER_DAY);
  });

  it("does nothing at all when there are no dates to pull", async () => {
    const streamDropped = vi.fn();
    const result = await harvestDroppedDomains({
      ...BASE,
      dates: [],
      streamDropped,
      insertMatches: vi.fn(),
    });

    expect(streamDropped).not.toHaveBeenCalled();
    expect(result.matched).toBe(0);
  });

  it("does not call out when the project has no vocabulary", async () => {
    const streamDropped = vi.fn();
    await harvestDroppedDomains({
      ...BASE,
      terms: [],
      dates: ["2026-08-19"],
      streamDropped,
      insertMatches: vi.fn(),
    });

    expect(streamDropped).not.toHaveBeenCalled();
  });

  // The bug this pins: completion used to be inferred from matched rows, so a
  // legitimate zero-match day left no trace and was re-downloaded on every
  // 15-minute tick -- 84 pulls of a 2 MB file per day.
  it("records a day that matched nothing", async () => {
    const recorded: Array<{ droppedOn: string; matched: number }> = [];

    await harvestDroppedDomains({
      ...BASE,
      dates: ["2026-08-19"],
      streamDropped: (_date, onDomain) => {
        onDomain("totally-unrelated.com");
        return Promise.resolve();
      },
      insertMatches: () => Promise.resolve(),
      recordRun: (input) => {
        recorded.push(input);
        return Promise.resolve();
      },
    });

    expect(recorded).toEqual([
      { projectId: "p1", droppedOn: "2026-08-19", matched: 0 },
    ]);
  });

  it("does not record a day whose inserts failed", async () => {
    const recorded: string[] = [];

    const result = await harvestDroppedDomains({
      ...BASE,
      dates: ["2026-08-19"],
      streamDropped: (_date, onDomain) => {
        onDomain("a-vending.com");
        return Promise.resolve();
      },
      insertMatches: () => Promise.reject(new Error("D1 write failed")),
      recordRun: (input) => {
        recorded.push(input.droppedOn);
        return Promise.resolve();
      },
    });

    expect(recorded).toEqual([]);
    expect(result.failedDates).toEqual(["2026-08-19"]);
  });
});
