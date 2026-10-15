import { describe, expect, it, vi } from "vitest";
import {
  isGradingReservedTick,
  runScheduledDomainWork,
  selectScheduledHarvestCandidate,
  type ScheduledHarvestProjectState,
} from "@/server/features/expired-domains/scheduledDomainHarvestPolicy";
import {
  HARVEST_INSERT_ROWS_PER_QUERY,
  MAX_GRADING_SUBREQUESTS,
  MAX_MATCHES_PER_DAY,
  MAX_SCHEDULED_HARVEST_SUBREQUESTS,
  WORKER_QUERY_BUDGET,
} from "@/shared/workerQueryBudget";

const SLOT_MS = 15 * 60 * 1_000;
const PUBLISHED_DATE = "2026-08-21";

function project(
  id: string,
  readiness: ScheduledHarvestProjectState["readiness"] = "ready",
): ScheduledHarvestProjectState {
  return { id, domain: `${id}.example`, completedDates: [], readiness };
}

const FULL_WEEK = [
  "2026-08-20",
  "2026-08-19",
  "2026-08-18",
  "2026-08-17",
  "2026-08-16",
  "2026-08-15",
  "2026-08-14",
];

describe("scheduled expired-domain work", () => {
  it("rotates three equally old projects across consecutive ticks", () => {
    const projects = [
      project("project-c"),
      project("project-a"),
      project("project-b"),
    ];
    const firstSlot = Date.parse("2026-08-21T00:00:00.000Z");

    const selectedIds = Array.from(
      { length: 3 },
      (_, index) =>
        selectScheduledHarvestCandidate({
          projects,
          publishedDate: PUBLISHED_DATE,
          scheduledAtMs: firstSlot + index * SLOT_MS,
        })?.projectId,
    );

    expect(new Set(selectedIds)).toEqual(
      new Set(["project-a", "project-b", "project-c"]),
    );
  });

  it("keeps a three-project capped tick under budget by harvesting exactly one", async () => {
    let subrequests = 0;
    const harvested: string[] = [];
    const grade = vi.fn(() => Promise.resolve());

    await runScheduledDomainWork(
      {
        canHarvest: true,
        publishedDate: PUBLISHED_DATE,
        scheduledAtMs: Date.parse("2026-08-21T00:00:00.000Z"),
      },
      {
        listProjectStates: () => {
          // Two fleet reads: projects with runs and profiles, then keywords.
          subrequests += 2;
          return Promise.resolve([
            project("project-a"),
            project("project-b"),
            project("project-c"),
          ]);
        },
        harvestProject: (candidate) => {
          const insertQueries = Math.ceil(
            MAX_MATCHES_PER_DAY / HARVEST_INSERT_ROWS_PER_QUERY,
          );
          // Selected-project path: three preparation D1 reads, two vocabulary
          // KV reads, claim, feed fetch, ownership read, every insert, completion,
          // and the worst-case fenced release after a lost completion response.
          subrequests += 3 + 2 + 1 + 1 + 1 + insertQueries + 1 + 1;
          harvested.push(candidate.projectId);
          return Promise.resolve();
        },
        draftProfile: () => Promise.resolve(),
        refreshLinkMetrics: () => Promise.resolve(false),
        grade,
      },
    );

    expect(harvested).toHaveLength(1);
    expect(grade).not.toHaveBeenCalled();
    expect(subrequests).toBe(MAX_SCHEDULED_HARVEST_SUBREQUESTS);
    expect(subrequests).toBeLessThanOrEqual(WORKER_QUERY_BUDGET);
  });

  it("grades one bounded batch only when there is no harvest work", async () => {
    let subrequests = 0;
    const harvestProject = vi.fn(() => Promise.resolve());

    await runScheduledDomainWork(
      {
        canHarvest: true,
        publishedDate: PUBLISHED_DATE,
        scheduledAtMs: Date.parse("2026-08-21T00:00:00.000Z"),
      },
      {
        listProjectStates: () => {
          subrequests += 1;
          return Promise.resolve([
            {
              ...project("complete"),
              completedDates: [
                "2026-08-20",
                "2026-08-19",
                "2026-08-18",
                "2026-08-17",
                "2026-08-16",
                "2026-08-15",
                "2026-08-14",
              ],
            },
          ]);
        },
        harvestProject,
        draftProfile: () => Promise.resolve(),
        refreshLinkMetrics: () => Promise.resolve(false),
        grade: () => {
          subrequests += MAX_GRADING_SUBREQUESTS;
          return Promise.resolve();
        },
      },
    );

    expect(harvestProject).not.toHaveBeenCalled();
    expect(subrequests).toBeLessThanOrEqual(WORKER_QUERY_BUDGET);
  });

  it("never falls through to grading after a harvest attempt fails", async () => {
    const grade = vi.fn(() => Promise.resolve());

    await expect(
      runScheduledDomainWork(
        {
          canHarvest: true,
          publishedDate: PUBLISHED_DATE,
          scheduledAtMs: Date.parse("2026-08-21T00:00:00.000Z"),
        },
        {
          listProjectStates: () => Promise.resolve([project("project-a")]),
          harvestProject: () => Promise.reject(new Error("feed failed")),
          draftProfile: () => Promise.resolve(),
          refreshLinkMetrics: () => Promise.resolve(false),
          grade,
        },
      ),
    ).rejects.toThrow("feed failed");
    expect(grade).not.toHaveBeenCalled();
  });

  it("never selects a project with no vocabulary for harvesting", () => {
    // Measured in production on 2026-10-15: a project with an empty profile
    // and no tracked keywords was chosen on every tick, failed, and kept
    // Domain Rating grading from ever running.
    const selected = selectScheduledHarvestCandidate({
      projects: [project("no-words", "draft-waiting")],
      publishedDate: PUBLISHED_DATE,
      scheduledAtMs: Date.parse("2026-08-21T00:30:00.000Z"),
    });
    expect(selected).toBeNull();
  });

  it("drafts a profile for a project without vocabulary once nothing waits to harvest", async () => {
    const drafted: string[] = [];
    const grade = vi.fn(() => Promise.resolve());
    const harvestProject = vi.fn(() => Promise.resolve());

    const unit = await runScheduledDomainWork(
      {
        canHarvest: true,
        publishedDate: PUBLISHED_DATE,
        scheduledAtMs: Date.parse("2026-08-21T00:30:00.000Z"),
      },
      {
        listProjectStates: () =>
          Promise.resolve([
            { ...project("complete"), completedDates: FULL_WEEK },
            project("new-project", "draft-due"),
          ]),
        harvestProject,
        refreshLinkMetrics: () => Promise.resolve(false),
        draftProfile: (candidate) => {
          drafted.push(candidate.projectId);
          return Promise.resolve();
        },
        grade,
      },
    );

    expect(unit).toBe("draft");
    expect(drafted).toEqual(["new-project"]);
    expect(harvestProject).not.toHaveBeenCalled();
    expect(grade).not.toHaveBeenCalled();
  });

  it("harvests a pending date before drafting anyone's profile", async () => {
    const draftProfile = vi.fn(() => Promise.resolve());

    const unit = await runScheduledDomainWork(
      {
        canHarvest: true,
        publishedDate: PUBLISHED_DATE,
        scheduledAtMs: Date.parse("2026-08-21T00:30:00.000Z"),
      },
      {
        listProjectStates: () =>
          Promise.resolve([
            project("pending"),
            project("new-project", "draft-due"),
          ]),
        harvestProject: () => Promise.resolve(),
        draftProfile,
        refreshLinkMetrics: () => Promise.resolve(false),
        grade: () => Promise.resolve(),
      },
    );

    expect(unit).toBe("harvest");
    expect(draftProfile).not.toHaveBeenCalled();
  });

  it("grades instead of retrying a draft that is still inside its retry window", async () => {
    const draftProfile = vi.fn(() => Promise.resolve());
    const grade = vi.fn(() => Promise.resolve());

    const unit = await runScheduledDomainWork(
      {
        canHarvest: true,
        publishedDate: PUBLISHED_DATE,
        scheduledAtMs: Date.parse("2026-08-21T00:30:00.000Z"),
      },
      {
        listProjectStates: () =>
          Promise.resolve([
            project("failed-today", "draft-waiting"),
            project("blank-saved-profile", "needs-input"),
          ]),
        harvestProject: () => Promise.resolve(),
        draftProfile,
        refreshLinkMetrics: () => Promise.resolve(false),
        grade,
      },
    );

    expect(unit).toBe("grade");
    expect(draftProfile).not.toHaveBeenCalled();
    expect(grade).toHaveBeenCalledOnce();
  });

  it("grades on the :45 tick even while harvest work is pending", async () => {
    const harvestProject = vi.fn(() => Promise.resolve());
    const listProjectStates = vi.fn(() =>
      Promise.resolve([project("pending")]),
    );
    const grade = vi.fn(() => Promise.resolve());

    const unit = await runScheduledDomainWork(
      {
        canHarvest: true,
        publishedDate: PUBLISHED_DATE,
        scheduledAtMs: Date.parse("2026-08-21T00:45:00.000Z"),
      },
      {
        listProjectStates,
        harvestProject,
        draftProfile: () => Promise.resolve(),
        refreshLinkMetrics: () => Promise.resolve(false),
        grade,
      },
    );

    expect(unit).toBe("grade");
    expect(harvestProject).not.toHaveBeenCalled();
    // The reserved tick spends nothing on the fleet read it does not need.
    expect(listProjectStates).not.toHaveBeenCalled();
    expect(grade).toHaveBeenCalledOnce();
  });

  it("reserves only the :45 tick for grading", () => {
    expect(isGradingReservedTick(Date.parse("2026-08-21T03:15:00.000Z"))).toBe(
      false,
    );
    expect(isGradingReservedTick(Date.parse("2026-08-21T03:30:00.000Z"))).toBe(
      false,
    );
    expect(isGradingReservedTick(Date.parse("2026-08-21T03:45:00.000Z"))).toBe(
      true,
    );
  });
});

// Metered work, so its own block: when it may run is the whole contract.
describe("scheduled link metrics", () => {
  it("fetches link metrics on the :30 tick once nothing waits to harvest", async () => {
    const refreshLinkMetrics = vi.fn(() => Promise.resolve(true));
    const draftProfile = vi.fn(() => Promise.resolve());
    const grade = vi.fn(() => Promise.resolve());

    const unit = await runScheduledDomainWork(
      {
        canHarvest: true,
        publishedDate: PUBLISHED_DATE,
        scheduledAtMs: Date.parse("2026-08-21T05:30:00.000Z"),
      },
      {
        listProjectStates: () =>
          Promise.resolve([
            { ...project("complete"), completedDates: FULL_WEEK },
            project("new-project", "draft-due"),
          ]),
        harvestProject: () => Promise.resolve(),
        draftProfile,
        refreshLinkMetrics,
        grade,
      },
    );

    expect(unit).toBe("links");
    expect(refreshLinkMetrics).toHaveBeenCalledOnce();
    expect(draftProfile).not.toHaveBeenCalled();
    expect(grade).not.toHaveBeenCalled();
  });

  it("never spends on link metrics outside the :30 tick", async () => {
    const refreshLinkMetrics = vi.fn(() => Promise.resolve(true));

    for (const minute of ["15", "45"]) {
      await runScheduledDomainWork(
        {
          canHarvest: true,
          publishedDate: PUBLISHED_DATE,
          scheduledAtMs: Date.parse(`2026-08-21T05:${minute}:00.000Z`),
        },
        {
          listProjectStates: () =>
            Promise.resolve([
              { ...project("complete"), completedDates: FULL_WEEK },
            ]),
          harvestProject: () => Promise.resolve(),
          draftProfile: () => Promise.resolve(),
          refreshLinkMetrics,
          grade: () => Promise.resolve(),
        },
      );
    }

    expect(refreshLinkMetrics).not.toHaveBeenCalled();
  });

  it("harvests before fetching link metrics, and falls through when none are pending", async () => {
    const refreshLinkMetrics = vi.fn(() => Promise.resolve(false));
    const grade = vi.fn(() => Promise.resolve());

    const harvestUnit = await runScheduledDomainWork(
      {
        canHarvest: true,
        publishedDate: PUBLISHED_DATE,
        scheduledAtMs: Date.parse("2026-08-21T05:30:00.000Z"),
      },
      {
        listProjectStates: () => Promise.resolve([project("pending")]),
        harvestProject: () => Promise.resolve(),
        draftProfile: () => Promise.resolve(),
        refreshLinkMetrics,
        grade,
      },
    );
    expect(harvestUnit).toBe("harvest");
    expect(refreshLinkMetrics).not.toHaveBeenCalled();

    const idleUnit = await runScheduledDomainWork(
      {
        canHarvest: true,
        publishedDate: PUBLISHED_DATE,
        scheduledAtMs: Date.parse("2026-08-21T05:30:00.000Z"),
      },
      {
        listProjectStates: () =>
          Promise.resolve([
            { ...project("complete"), completedDates: FULL_WEEK },
          ]),
        harvestProject: () => Promise.resolve(),
        draftProfile: () => Promise.resolve(),
        refreshLinkMetrics,
        grade,
      },
    );
    expect(idleUnit).toBe("grade");
    expect(refreshLinkMetrics).toHaveBeenCalledOnce();
    expect(grade).toHaveBeenCalledOnce();
  });

  it("still checks stored rows for link metrics after the feed key is removed", async () => {
    const refreshLinkMetrics = vi.fn(() => Promise.resolve(true));
    const listProjectStates = vi.fn(() => Promise.resolve([]));

    const unit = await runScheduledDomainWork(
      {
        canHarvest: false,
        publishedDate: PUBLISHED_DATE,
        scheduledAtMs: Date.parse("2026-08-21T05:30:00.000Z"),
      },
      {
        listProjectStates,
        harvestProject: () => Promise.resolve(),
        draftProfile: () => Promise.resolve(),
        refreshLinkMetrics,
        grade: () => Promise.resolve(),
      },
    );

    expect(unit).toBe("links");
    expect(listProjectStates).not.toHaveBeenCalled();
  });
});
