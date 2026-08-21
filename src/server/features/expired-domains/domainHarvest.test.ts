import { describe, expect, it, vi } from "vitest";
import {
  datesToHarvest,
  harvestDroppedDomains,
  MAX_MATCHES_PER_DAY,
} from "@/server/features/expired-domains/domainHarvest";

type HarvestInput = Parameters<typeof harvestDroppedDomains>[0];
type ProjectInput = HarvestInput["projects"][number];
type StoredMatch = Parameters<HarvestInput["insertMatches"]>[0][number];

const NOW = new Date("2026-08-21T12:00:00.000Z");
const DATE = "2026-08-19";

function project(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    projectId: "p1",
    droppedOn: DATE,
    terms: ["vending", "coffee", "snack"],
    exclude: ["deliotx.com"],
    ...overrides,
  };
}

function buildInput(
  projects: ProjectInput[],
  overrides: Partial<Omit<HarvestInput, "projects">> = {},
): HarvestInput {
  return {
    projects,
    now: () => NOW,
    claimRun: ({ projectId, droppedOn }) =>
      Promise.resolve(`${projectId}:${droppedOn}`),
    completeRun: () => Promise.resolve(true),
    releaseRun: () => Promise.resolve(),
    streamDropped: () => Promise.resolve(),
    insertMatches: () => Promise.resolve(),
    ...overrides,
  };
}

describe("datesToHarvest", () => {
  const TODAY = "2026-08-21";

  it("skips today, whose file does not exist until tomorrow", () => {
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

  it("skips dates that completed, including a zero-match date", () => {
    expect(
      datesToHarvest({
        today: TODAY,
        already: ["2026-08-20", "2026-08-19"],
        maxDays: 3,
      }),
    ).toEqual(["2026-08-18"]);
  });
});

describe("harvestDroppedDomains", () => {
  it("streams a date once and preserves project vocabulary and exclusions", async () => {
    const inserted: StoredMatch[] = [];
    const streamDropped = vi.fn(
      (_date: string, onDomain: (domain: string) => boolean) => {
        for (const domain of [
          "skip-vending.com",
          "fresh-vending.com",
          "fresh-coffee.com",
          "unrelated.com",
        ]) {
          if (!onDomain(domain)) break;
        }
        return Promise.resolve();
      },
    );

    await harvestDroppedDomains(
      buildInput(
        [
          project({ terms: ["vending"], exclude: ["skip-vending.com"] }),
          project({ projectId: "p2", terms: ["coffee"], exclude: [] }),
        ],
        {
          streamDropped,
          insertMatches: (rows) => {
            inserted.push(...rows);
            return Promise.resolve();
          },
        },
      ),
    );

    expect(streamDropped).toHaveBeenCalledTimes(1);
    expect(
      inserted.map((row) => [row.projectId, row.domain, row.matchedTerm]),
    ).toEqual([
      ["p1", "fresh-vending.com", "vending"],
      ["p2", "fresh-coffee.com", "coffee"],
    ]);
  });

  it("downloads each distinct date once and continues after a feed failure", async () => {
    const inserted: StoredMatch[] = [];
    const releaseRun = vi.fn(() => Promise.resolve());
    const streamDropped = vi.fn(
      (date: string, onDomain: (domain: string) => boolean) => {
        if (date === DATE) return Promise.reject(new Error("feed failed"));
        onDomain("good-coffee.com");
        return Promise.resolve();
      },
    );

    const result = await harvestDroppedDomains(
      buildInput(
        [
          project({ terms: ["vending"] }),
          project({
            projectId: "p2",
            droppedOn: "2026-08-18",
            terms: ["coffee"],
          }),
        ],
        {
          streamDropped,
          releaseRun,
          insertMatches: (rows) => {
            inserted.push(...rows);
            return Promise.resolve();
          },
        },
      ),
    );

    expect(streamDropped.mock.calls.map(([date]) => date)).toEqual([
      DATE,
      "2026-08-18",
    ]);
    expect(releaseRun).toHaveBeenCalledWith(`p1:${DATE}`);
    expect(inserted.map((row) => row.domain)).toEqual(["good-coffee.com"]);
    expect(result.failedRuns).toEqual([{ projectId: "p1", droppedOn: DATE }]);
  });

  it("stops a full project without ending the shared stream", async () => {
    const inserted: StoredMatch[] = [];
    const domains = [
      ...Array.from(
        { length: MAX_MATCHES_PER_DAY },
        (_, index) => `rent-${index}.com`,
      ),
      "late-coffee.com",
    ];

    await harvestDroppedDomains(
      buildInput(
        [
          project({ terms: ["rent"], exclude: [] }),
          project({ projectId: "p2", terms: ["coffee"], exclude: [] }),
        ],
        {
          streamDropped: (_date, onDomain) => {
            for (const domain of domains) {
              if (!onDomain(domain)) break;
            }
            return Promise.resolve();
          },
          insertMatches: (rows) => {
            inserted.push(...rows);
            return Promise.resolve();
          },
        },
      ),
    );

    expect(inserted.filter((row) => row.projectId === "p1")).toHaveLength(
      MAX_MATCHES_PER_DAY,
    );
    expect(
      inserted.filter((row) => row.projectId === "p2").map((row) => row.domain),
    ).toEqual(["late-coffee.com"]);
  });

  it("does not stream when every atomic claim is rejected", async () => {
    const streamDropped = vi.fn(() => Promise.resolve());

    await harvestDroppedDomains(
      buildInput([project()], {
        claimRun: () => Promise.resolve(null),
        streamDropped,
      }),
    );

    expect(streamDropped).not.toHaveBeenCalled();
  });

  it("completes a zero-match day with a 30-minute lease", async () => {
    const claimRun = vi.fn(() => Promise.resolve("claim-1"));
    const completeRun = vi.fn(() => Promise.resolve(true));

    await harvestDroppedDomains(
      buildInput([project()], { claimRun, completeRun }),
    );

    expect(claimRun).toHaveBeenCalledWith({
      projectId: "p1",
      droppedOn: DATE,
      claimedAtIso: "2026-08-21T12:00:00.000Z",
      leaseExpiresAtIso: "2026-08-21T12:30:00.000Z",
    });
    expect(completeRun).toHaveBeenCalledWith({
      claimId: "claim-1",
      matched: 0,
      completedAtIso: "2026-08-21T12:00:00.000Z",
    });
  });

  it("lets only one of two overlapping ticks process a project and date", async () => {
    let claimed = false;
    const claimRun = vi.fn(() => {
      if (claimed) return Promise.resolve(null);
      claimed = true;
      return Promise.resolve("owner");
    });
    const streamDropped = vi.fn(
      (_date: string, onDomain: (domain: string) => boolean) => {
        onDomain("a-vending.com");
        return Promise.resolve();
      },
    );
    const insertMatches = vi.fn(() => Promise.resolve());
    const completeRun = vi.fn(() => Promise.resolve(true));

    await Promise.all([
      harvestDroppedDomains(
        buildInput([project()], {
          claimRun,
          streamDropped,
          insertMatches,
          completeRun,
        }),
      ),
      harvestDroppedDomains(
        buildInput([project()], {
          claimRun,
          streamDropped,
          insertMatches,
          completeRun,
        }),
      ),
    ]);

    expect(claimRun).toHaveBeenCalledTimes(2);
    expect(streamDropped).toHaveBeenCalledTimes(1);
    expect(insertMatches).toHaveBeenCalledTimes(1);
    expect(completeRun).toHaveBeenCalledTimes(1);
  });

  it("releases a failed claim so a later tick retries it", async () => {
    let state: "free" | "claimed" | "complete" = "free";
    let token = 0;
    let streamAttempt = 0;
    const claimRun = vi.fn(() => {
      if (state !== "free") return Promise.resolve(null);
      state = "claimed";
      token += 1;
      return Promise.resolve(`claim-${token}`);
    });
    const releaseRun = vi.fn(() => {
      state = "free";
      return Promise.resolve();
    });
    const completeRun = vi.fn(() => {
      state = "complete";
      return Promise.resolve(true);
    });
    const streamDropped = vi.fn(
      (_date: string, onDomain: (domain: string) => boolean) => {
        streamAttempt += 1;
        if (streamAttempt === 1)
          return Promise.reject(new Error("feed failed"));
        onDomain("a-vending.com");
        return Promise.resolve();
      },
    );
    const shared = { claimRun, releaseRun, completeRun, streamDropped };

    const first = await harvestDroppedDomains(buildInput([project()], shared));
    const second = await harvestDroppedDomains(buildInput([project()], shared));

    expect(first.failedRuns).toEqual([{ projectId: "p1", droppedOn: DATE }]);
    expect(second.harvestedRuns).toEqual([
      { projectId: "p1", droppedOn: DATE },
    ]);
    expect(releaseRun).toHaveBeenCalledWith("claim-1");
    expect(streamDropped).toHaveBeenCalledTimes(2);
  });

  it("releases a claim when inserting its matches fails", async () => {
    const completeRun = vi.fn(() => Promise.resolve(true));
    const releaseRun = vi.fn(() => Promise.resolve());

    const result = await harvestDroppedDomains(
      buildInput([project()], {
        streamDropped: (_date, onDomain) => {
          onDomain("a-vending.com");
          return Promise.resolve();
        },
        insertMatches: () => Promise.reject(new Error("D1 write failed")),
        completeRun,
        releaseRun,
      }),
    );

    expect(completeRun).not.toHaveBeenCalled();
    expect(releaseRun).toHaveBeenCalledWith(`p1:${DATE}`);
    expect(result.failedRuns).toEqual([{ projectId: "p1", droppedOn: DATE }]);
  });
});
