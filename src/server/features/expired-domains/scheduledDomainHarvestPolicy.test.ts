import { describe, expect, it, vi } from "vitest";
import {
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

function project(id: string): ScheduledHarvestProjectState {
  return { id, domain: `${id}.example`, completedDates: [] };
}

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
          subrequests += 1;
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
          grade,
        },
      ),
    ).rejects.toThrow("feed failed");
    expect(grade).not.toHaveBeenCalled();
  });
});
