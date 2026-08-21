import { describe, expect, it, vi } from "vitest";
import {
  datesToHarvest,
  harvestDroppedDomains,
  MAX_MATCHES_PER_DAY,
} from "@/server/features/expired-domains/domainHarvest";
import { AppError } from "@/server/lib/errors";

type HarvestInput = Parameters<typeof harvestDroppedDomains>[0];
type ProjectInput = HarvestInput["projects"][number];
type StoredMatch = Parameters<HarvestInput["insertMatches"]>[0][number];
type ProjectOverrides = Omit<Partial<ProjectInput>, "terms"> & {
  terms?: string[] | ProjectInput["terms"];
};

const NOW = new Date("2026-08-21T12:00:00.000Z");
const DATE = "2026-08-19";

function project(overrides: ProjectOverrides = {}): ProjectInput {
  const { terms = ["vending", "coffee", "snack"], ...rest } = overrides;
  return {
    projectId: "p1",
    droppedOn: DATE,
    terms: typeof terms === "function" ? terms : () => Promise.resolve(terms),
    exclude: ["deliotx.com"],
    ...rest,
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
    skipRun: () => Promise.resolve(true),
    releaseRun: () => Promise.resolve(),
    ownsRun: () => Promise.resolve(true),
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
  it("caps one project's stored matches at the budget-derived cap and cancels the shared stream", async () => {
    const inserted: StoredMatch[] = [];
    let streamed = 0;

    await harvestDroppedDomains(
      buildInput([project({ terms: ["rent"], exclude: [] })], {
        streamDropped: (_date, onDomain) => {
          for (let index = 0; index < MAX_MATCHES_PER_DAY + 5; index += 1) {
            streamed += 1;
            if (!onDomain(`rent-${index}.com`)) break;
          }
          return Promise.resolve();
        },
        insertMatches: (rows) => {
          inserted.push(...rows);
          return Promise.resolve();
        },
      }),
    );

    expect(MAX_MATCHES_PER_DAY).toBe(184);
    expect(inserted).toHaveLength(MAX_MATCHES_PER_DAY);
    expect(streamed).toBe(MAX_MATCHES_PER_DAY);
  });

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

  it("records an inaccessible subscription-window date as permanently skipped", async () => {
    const skipRun = vi.fn(() => Promise.resolve(true));
    const releaseRun = vi.fn(() => Promise.resolve());

    const result = await harvestDroppedDomains(
      buildInput([project()], {
        streamDropped: () =>
          Promise.reject(
            new AppError(
              "WHOISFREAKS_SUBSCRIPTION_WINDOW",
              "outside subscription window",
            ),
          ),
        skipRun,
        releaseRun,
      }),
    );

    expect(skipRun).toHaveBeenCalledWith({
      claimId: "p1:" + DATE,
      reason: "WHOISFREAKS_SUBSCRIPTION_WINDOW",
      completedAtIso: NOW.toISOString(),
    });
    expect(releaseRun).not.toHaveBeenCalled();
    expect(result).toEqual({
      harvestedRuns: [],
      skippedRuns: [{ projectId: "p1", droppedOn: DATE }],
      failedRuns: [],
      matched: 0,
    });
  });

  it("releases a bad-key 401 claim so a later request may retry it", async () => {
    const skipRun = vi.fn(() => Promise.resolve(true));
    const releaseRun = vi.fn(() => Promise.resolve());

    const result = await harvestDroppedDomains(
      buildInput([project()], {
        streamDropped: () =>
          Promise.reject(
            new AppError("WHOISFREAKS_AUTH_FAILED", "invalid API key"),
          ),
        skipRun,
        releaseRun,
      }),
    );

    expect(skipRun).not.toHaveBeenCalled();
    expect(releaseRun).toHaveBeenCalledWith("p1:" + DATE);
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
});
