import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, withPgClient } from "@/db";
import {
  projects,
  opportunities,
  opportunitySnapshots,
  opportunityEvents,
  opportunityRuns,
} from "@/db/schema";
import { OpportunityRepository } from "@/server/features/opportunities/OpportunityRepository";
import { evidence } from "@/server/features/opportunities/evidence.fixture";
import { detectDecliningPages } from "@/server/features/opportunities/detectors";
import { scope, save } from "./runtime.fixture";

describe("persisted opportunities on real PostgreSQL", () => {
  it("deduplicates reruns while retaining immutable evidence, assignment and baseline", async () =>
    withPgClient(async () => {
      const task = await save();
      await OpportunityRepository.update(
        scope,
        task.id,
        task.revision,
        {
          status: "implemented",
          assigneeUserId: "user-a",
          implementedAt: "2026-10-11T12:00:00Z",
          note: "Reviewed title",
        },
        "user-a",
      );
      await OpportunityRepository.putSnapshot(
        evidence({ current: { clicks: 999, impressions: 1000, position: 1 } }),
        "hash-a",
        "replacement-key",
      );
      const rerun = await save("2");
      expect(rerun).toMatchObject({
        id: task.id,
        status: "implemented",
        assigneeUserId: "user-a",
        implementedAt: "2026-10-11T12:00:00Z",
        evidence: { current: { clicks: 50 } },
      });
      expect(
        await OpportunityRepository.getBaseline(scope, task.id),
      ).toMatchObject({ current: { clicks: 50 } });
      expect(await OpportunityRepository.list(scope)).toHaveLength(1);
      expect(
        rerun.history.some((event) => event.note === "Reviewed title"),
      ).toBe(true);
    }));

  it("rejects concurrent stale mutations and commits exactly one event", async () => {
    const task = await withPgClient(save);
    const edits = await Promise.allSettled(
      ["First", "Second"].map((note) =>
        withPgClient(() =>
          OpportunityRepository.update(
            scope,
            task.id,
            task.revision,
            { status: "in_progress", note },
            "user-a",
          ),
        ),
      ),
    );
    expect(
      edits.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = edits.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "CONFLICT" },
    });
    const current = await withPgClient(() =>
      OpportunityRepository.get(scope, task.id),
    );
    expect(current!.revision).toBe(2);
    expect(
      current!.history.filter((event) => event.kind === "updated"),
    ).toHaveLength(1);
  });

  it("retains earlier measurement results when a later observation is insufficient", async () =>
    withPgClient(async () => {
      const task = await save();
      const implemented = await OpportunityRepository.update(
        scope,
        task.id,
        task.revision,
        {
          status: "implemented",
          implementedAt: "2026-10-11T12:00:00Z",
          note: "Reviewed title",
        },
        "user-a",
      );
      const after = evidence({
        window: { startDate: "2026-10-18", endDate: "2026-11-14" },
        current: { clicks: 70, impressions: 1300, position: 6 },
      });
      await OpportunityRepository.putSnapshot(after, "hash-after", "after-key");
      const measured = await OpportunityRepository.storeMeasurement(
        scope,
        task.id,
        implemented.revision,
        "hash-after",
        "user-a",
      );
      expect(measured).toMatchObject({
        status: "measured",
        result: { availability: "measured", clicksChange: 20 },
      });
      await OpportunityRepository.putSnapshot(
        {
          ...after,
          current: { clicks: 0, impressions: 0, position: null },
          coverage: { ...after.coverage, currentRows: 0 },
        },
        "hash-pending",
        "pending-key",
      );
      const pending = await OpportunityRepository.storeMeasurement(
        scope,
        task.id,
        measured.revision,
        "hash-pending",
        "user-a",
      );
      expect(pending).toMatchObject({
        status: "results_pending",
        result: { availability: "insufficient", clicksChange: null },
      });
      expect(
        pending.history
          .filter((event) => event.kind === "measurement")
          .map((event) => event.result?.availability),
      ).toEqual(["measured", "insufficient"]);
    }));

  it("bounds history and filters status before paging the work list", async () =>
    withPgClient(async () => {
      const task = await save();
      const finding = detectDecliningPages([evidence()])[0];
      const { evidence: _captured, ...generated } = finding;
      await db.insert(opportunities).values(
        Array.from({ length: 102 }, (_, index) => ({
          id: `task-${String(index).padStart(3, "0")}`,
          organizationId: "org-a",
          projectId: "project-a",
          target: "example.com",
          scopeKey: "scope-a",
          dedupeKey: `dedupe-${index}`,
          detectorId: "page-decline",
          detectorVersion: "1",
          kind: "page_decline" as const,
          priorityBand: "low" as const,
          generatedJson: JSON.stringify(generated),
          evidenceSnapshotId: "hash-a",
          status:
            index === 101 ? ("dismissed" as const) : ("not_started" as const),
          firstSeenAt: evidence().fetchedAt,
          lastSeenAt: evidence().fetchedAt,
          lastEvaluatedAt: evidence().fetchedAt,
          mutationId: `mutation-${index}`,
        })),
      );
      expect(await OpportunityRepository.list(scope, 101)).toHaveLength(101);
      expect(
        await OpportunityRepository.list(scope, 100, { offset: 100 }),
      ).toHaveLength(3);
      expect(
        await OpportunityRepository.list(scope, 100, { status: "dismissed" }),
      ).toMatchObject([{ id: "task-101" }]);
      await db.insert(opportunityEvents).values(
        Array.from({ length: 120 }, (_, index) => ({
          id: `event-${index}`,
          organizationId: "org-a",
          projectId: "project-a",
          opportunityId: task.id,
          actorUserId: "user-a",
          createdAt: evidence().fetchedAt,
          kind: "updated" as const,
          status: "in_progress" as const,
          revision: index + 2,
          note: `Note ${index}`,
          evidenceSnapshotId: "hash-a",
        })),
      );
      const reloaded = (await OpportunityRepository.get(scope, task.id))!;
      expect(reloaded.history).toHaveLength(50);
      expect(reloaded.historyCoverage).toEqual({
        hasMore: true,
        beforeRevision: 72,
      });
      expect((await OpportunityRepository.list(scope))[0].history).toEqual(
        reloaded.history,
      );
      const older = await OpportunityRepository.history(scope, task.id, 72);
      expect(older).toMatchObject({ hasMore: true, beforeRevision: 22 });
      expect(older.events).toHaveLength(50);
      expect(
        (await OpportunityRepository.history(scope, task.id, 22)).events,
      ).toHaveLength(21);
    }));

  it("rejects foreign scope and assignee access and does not reopen older observations", async () =>
    withPgClient(async () => {
      const task = await save();
      expect(
        await OpportunityRepository.get(
          { ...scope, organizationId: "org-b" },
          task.id,
        ),
      ).toBeNull();
      expect(
        await OpportunityRepository.get(
          { ...scope, projectId: "project-b" },
          task.id,
        ),
      ).toBeNull();
      expect(
        await OpportunityRepository.list({
          ...scope,
          target: "replacement.com",
        }),
      ).toEqual([]);
      await expect(
        OpportunityRepository.history(
          { ...scope, target: "replacement.com" },
          task.id,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        OpportunityRepository.update(
          scope,
          task.id,
          task.revision,
          { assigneeUserId: "user-b" },
          "user-a",
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await OpportunityRepository.reconcileObserved(scope, {
        scopeKey: "scope-a",
        detectorId: "page-decline",
        observedDedupeKeys: [],
        complete: false,
        fetchedAt: "2026-10-15T12:00:00Z",
      });
      expect(
        (await OpportunityRepository.get(scope, task.id))!.observationState,
      ).toBe("observed");
      await OpportunityRepository.reconcileObserved(scope, {
        scopeKey: "scope-a",
        detectorId: "page-decline",
        observedDedupeKeys: [],
        complete: true,
        fetchedAt: "2026-10-15T12:00:00Z",
      });
      const rerun = await save("2");
      expect(rerun).toMatchObject({
        observationState: "no_longer_observed",
        status: "not_started",
      });
    }));

  it("cascades project-owned work, snapshots, events and runs while preserving another tenant", async () =>
    withPgClient(async () => {
      await save();
      await OpportunityRepository.recordRun(
        scope,
        "scope-a",
        {
          id: "run-a",
          fetchedAt: evidence().fetchedAt,
          observedFrom: evidence().window.startDate,
          observedTo: evidence().window.endDate,
          availability: "ready",
          reasons: [],
        },
        "page-decline",
        "1",
      );
      expect(await OpportunityRepository.latestRun(scope)).toMatchObject({
        id: "run-a",
      });
      await db.delete(projects).where(eq(projects.id, "project-a"));
      expect(await db.select().from(opportunities)).toEqual([]);
      expect(await db.select().from(opportunityEvents)).toEqual([]);
      expect(await db.select().from(opportunitySnapshots)).toEqual([]);
      expect(await db.select().from(opportunityRuns)).toEqual([]);
      expect(await db.select().from(projects)).toMatchObject([
        { id: "project-b", organizationId: "org-b" },
      ]);
    }));
});
