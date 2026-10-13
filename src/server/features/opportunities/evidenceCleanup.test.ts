import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/opportunity-test-schema";
import { evidence } from "./evidence.fixture";
import { openEvidenceDatabase } from "./evidenceDatabase.fixture";

import { eq } from "drizzle-orm";

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
const state = vi.hoisted(() => ({
  database: null as TestDb | null,
  objects: new Map<string, string>(),
  failR2: false,
  failDelete: false,
  deleting: null as null | (() => Promise<void>),
  uploads: new Map<string, Date>(),
  pageSize: 50,
  queryCount: 0,
}));
vi.mock("cloudflare:workers", async () => ({
  env: { R2: (await import("./evidenceR2.fixture")).evidenceR2Binding(state) },
}));
vi.mock("@/db", () => ({
  get db() {
    return state.database;
  },
}));
vi.mock(
  "@/db/schema",
  async () => await import("@/db/opportunity-test-schema"),
);
vi.mock("@/db/runBatch", () => ({
  runBatch: async (build: (tx: TestDb) => Parameters<TestDb["batch"]>[0]) => {
    const statements = build(state.database!);
    if (statements.length) await state.database!.batch(statements);
  },
}));
import { retainEvidence, persistFinding } from "./opportunityEvidence";
import {
  previewEvidenceObjects,
  deleteEvidenceOrphans,
} from "./evidenceCleanup";
import { detectDecliningPages } from "./detectors";
import { OpportunityRepository } from "./OpportunityRepository";

let client: Client;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  state.objects.clear();
  state.failR2 = false;
  state.failDelete = false;
  state.deleting = null;
  state.uploads.clear();
  state.pageSize = 50;
  client = await openEvidenceDatabase();
  state.database = drizzle(client, {
    schema,
    logger: {
      logQuery() {
        state.queryCount++;
      },
    },
  });
  state.queryCount = 0;
});

afterEach(() => {
  vi.useRealTimers();
  client.close();
  state.database = null;
});

const context = {
  organizationId: "org-a",
  userId: "user-a",
  projectId: "project-a",
  project: { domain: "example.com" },
};
const age = () => vi.setSystemTime(new Date("2026-10-14T13:00:00Z"));
async function orphan(snapshot = evidence()) {
  await retainEvidence(snapshot, null, async (hash) => hash);
  return [...state.objects.keys()].at(-1)!;
}
async function putLegacy(projectId: string, hash = "a".repeat(64)) {
  const key = `opportunity-evidence/org-a/${projectId}/${hash}.json`;
  state.objects.set(key, "{}");
  state.uploads.set(key, new Date());
  return key;
}
describe("bounded evidence cleanup on real SQLite", () => {
  it("keeps a worst-case five-object legacy batch below the Free-plan query allowance", async () => {
    const keys: string[] = [];
    for (const hash of ["a", "b", "c", "d", "e"])
      keys.push(await putLegacy("deleted", hash.repeat(64)));
    age();
    state.queryCount = 0;
    expect((await previewEvidenceObjects(context)).objects).toHaveLength(5);
    expect(state.queryCount).toBeLessThanOrEqual(16);
    state.queryCount = 0;
    expect((await deleteEvidenceOrphans(context, keys)).deleted).toHaveLength(
      5,
    );
    expect(state.queryCount).toBeLessThanOrEqual(36);
    await expect(
      deleteEvidenceOrphans(
        context,
        Array.from({ length: 6 }, () => keys[0]),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("previews without deleting and removes only aged unreferenced snapshots", async () => {
    const key = await orphan();
    age();
    const preview = await previewEvidenceObjects(context);
    expect(preview.objects).toMatchObject([{ key, disposition: "eligible" }]);
    expect(state.objects.has(key)).toBe(true);
    expect(await deleteEvidenceOrphans(context, [key])).toEqual({
      deleted: [key],
      skipped: [],
      failed: [],
    });
    expect(state.objects.has(key)).toBe(false);
    expect(
      await state.database!.select().from(schema.opportunitySnapshots),
    ).toEqual([]);
    expect(
      (
        await state.database!.select().from(schema.opportunityEvidenceObjects)
      )[0],
    ).toMatchObject({ state: "deleted", lastActorUserId: "user-a" });
    await expect(
      retainEvidence(evidence(), null, async () => undefined),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("keeps recent objects through the production 24-hour grace", async () => {
    const key = await orphan();
    vi.setSystemTime(new Date("2026-10-14T11:59:59Z"));
    expect((await deleteEvidenceOrphans(context, [key])).skipped).toEqual([
      { key, reason: "recent" },
    ]);
    expect(state.objects.has(key)).toBe(true);
    age();
    expect((await deleteEvidenceOrphans(context, [key])).deleted).toEqual([
      key,
    ]);
  });
  it("protects current evidence, implementation baseline and historical event evidence", async () => {
    const first = evidence();
    const task = await persistFinding(
      detectDecliningPages([first])[0],
      context,
      "page-decline",
    );
    await OpportunityRepository.update(
      first.scope,
      task.id,
      task.revision,
      {
        status: "implemented",
        note: "Updated the article and captured its baseline.",
        implementedAt: "2026-10-13T12:00:00Z",
      },
      context.userId,
    );
    for (const fetchedAt of ["2026-10-13T12:01:00Z", "2026-10-13T12:02:00Z"]) {
      const snapshot = evidence({ fetchedAt });
      await persistFinding(
        detectDecliningPages([snapshot])[0],
        context,
        "page-decline",
      );
    }
    age();
    const keys = [...state.objects.keys()];
    expect(
      (await previewEvidenceObjects(context)).objects.every(
        (o) => o.disposition === "referenced",
      ),
    ).toBe(true);
    const result = await deleteEvidenceOrphans(context, keys);
    expect(result.deleted).toEqual([]);
    expect(result.skipped).toHaveLength(3);
    expect(
      (await OpportunityRepository.history(first.scope, task.id)).events,
    ).toHaveLength(4);
    expect(state.objects.size).toBe(3);
  });
  it("rechecks a preview when a writer attaches the same evidence", async () => {
    const key = await orphan(detectDecliningPages([evidence()])[0].evidence);
    age();
    expect((await previewEvidenceObjects(context)).counts.eligible).toBe(1);
    await persistFinding(
      detectDecliningPages([evidence()])[0],
      context,
      "page-decline",
    );
    expect((await deleteEvidenceOrphans(context, [key])).skipped).toEqual([
      { key, reason: "referenced" },
    ]);
  });
  it("keeps a writer fenced even after its object becomes old", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((r) => {
      entered = r;
    });
    const wait = new Promise<void>((r) => {
      release = r;
    });
    const writing = retainEvidence(evidence(), null, async () => {
      entered();
      await wait;
    });
    await started;
    age();
    const key = [...state.objects.keys()][0];
    expect((await deleteEvidenceOrphans(context, [key])).skipped).toEqual([
      { key, reason: "busy" },
    ]);
    release();
    await writing;
  });
  it("cleanup ownership rejects a concurrent writer until and after deletion", async () => {
    const key = await orphan();
    age();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((r) => {
      entered = r;
    });
    const wait = new Promise<void>((r) => {
      release = r;
    });
    state.deleting = async () => {
      entered();
      await wait;
    };
    const deleting = deleteEvidenceOrphans(context, [key]);
    await started;
    await expect(
      retainEvidence(evidence(), null, async () => undefined),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    release();
    expect((await deleting).deleted).toEqual([key]);
    await expect(
      retainEvidence(evidence(), null, async () => undefined),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("an R2 failure stays fenced and is safely retryable", async () => {
    const key = await orphan();
    age();
    state.failDelete = true;
    expect((await deleteEvidenceOrphans(context, [key])).failed).toHaveLength(
      1,
    );
    expect(state.objects.has(key)).toBe(true);
    expect(
      (
        await state.database!.select().from(schema.opportunityEvidenceObjects)
      )[0].state,
    ).toBe("deleting");
    await expect(
      retainEvidence(evidence(), null, async () => undefined),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    state.failDelete = false;
    expect((await deleteEvidenceOrphans(context, [key])).deleted).toEqual([
      key,
    ]);
  });
  it("finishes interrupted SQL bookkeeping when R2 deletion already succeeded", async () => {
    const key = await orphan();
    age();
    await state
      .database!.update(schema.opportunityEvidenceObjects)
      .set({ state: "deleting" })
      .where(eq(schema.opportunityEvidenceObjects.key, key));
    state.objects.delete(key);
    const result = await deleteEvidenceOrphans(context, [key]);
    expect(result.deleted).toEqual([key]);
    expect(
      await state.database!.select().from(schema.opportunitySnapshots),
    ).toEqual([]);
    expect(
      (
        await state.database!.select().from(schema.opportunityEvidenceObjects)
      )[0].state,
    ).toBe("deleted");
  });
  it("protects active legacy objects, but cleans deleted-project objects", async () => {
    const active = await putLegacy("project-a");
    const gone = await putLegacy("deleted-project");
    age();
    const result = await deleteEvidenceOrphans(context, [active, gone]);
    expect(result.deleted).toEqual([gone]);
    expect(result.skipped).toEqual([{ key: active, reason: "legacy" }]);
    expect(state.objects.has(active)).toBe(true);
    expect(
      (
        await state.database!.select().from(schema.opportunityEvidenceObjects)
      )[0],
    ).toMatchObject({ key: gone, state: "deleted" });
  });
  it("does not delete foreign, malformed, missing or inconsistent-ledger keys", async () => {
    const own = await orphan();
    age();
    await state
      .database!.update(schema.opportunityEvidenceObjects)
      .set({ organizationId: "org-b" })
      .where(eq(schema.opportunityEvidenceObjects.key, own));
    const foreign = own.replace("org-a", "org-b");
    state.objects.set(foreign, "{}");
    state.uploads.set(foreign, new Date("2026-10-13T12:00:00Z"));
    const invalid = "opportunity-evidence/org-a/project-a/invalid.json";
    const missing = `opportunity-evidence/org-a/project-a/${"f".repeat(64)}.json`;
    const result = await deleteEvidenceOrphans(context, [
      foreign,
      invalid,
      missing,
      own,
    ]);
    expect(result.skipped).toEqual([
      { key: foreign, reason: "outside_scope" },
      { key: invalid, reason: "invalid" },
      { key: missing, reason: "missing" },
      { key: own, reason: "invalid" },
    ]);
    expect(state.objects.size).toBe(2);
  });
  it("requires actual owner/admin membership for both operations", async () => {
    const key = await orphan();
    age();
    for (const userId of ["user-b", "missing"]) {
      await expect(
        previewEvidenceObjects({ ...context, userId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        deleteEvidenceOrphans({ ...context, userId }, [key]),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await client.execute("UPDATE member SET role='member' WHERE id='member-a'");
    await expect(deleteEvidenceOrphans(context, [key])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await client.execute("UPDATE member SET role='admin' WHERE id='member-a'");
    expect((await deleteEvidenceOrphans(context, [key])).deleted).toEqual([
      key,
    ]);
  });
  it("honors continuation when R2 returns fewer objects than the requested limit", async () => {
    for (const hash of ["a", "b", "c"])
      await putLegacy("deleted", hash.repeat(64));
    age();
    state.pageSize = 2;
    const first = await previewEvidenceObjects(context);
    expect(first.objects).toHaveLength(2);
    expect(first.nextCursor).toBe("2");
    const next = await previewEvidenceObjects(context, first.nextCursor!);
    expect(next.objects).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
  });
  it("bounds deletion input and deduplicates selected keys", async () => {
    const key = await orphan();
    age();
    await expect(
      deleteEvidenceOrphans(
        context,
        Array.from({ length: 51 }, () => key),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await deleteEvidenceOrphans(context, [key, key])).deleted).toEqual([
      key,
    ]);
  });
});
