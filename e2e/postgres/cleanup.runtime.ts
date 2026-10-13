import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, withPgClient } from "@/db";
import {
  member,
  opportunityEvidenceObjects,
  opportunitySnapshots,
} from "@/db/schema";
import { OpportunityRepository } from "@/server/features/opportunities/OpportunityRepository";
import { evidence } from "@/server/features/opportunities/evidence.fixture";
import {
  deleteEvidenceOrphans,
  previewEvidenceObjects,
} from "@/server/features/opportunities/evidenceCleanup";
import { fakeR2Objects } from "./worker-env";
import { scope } from "./runtime.fixture";

const context = {
  organizationId: scope.organizationId,
  userId: "user-a",
};
const aged = new Date(Date.now() - 48 * 60 * 60 * 1000);
beforeEach(async () => {
  fakeR2Objects.clear();
  await withPgClient(() =>
    db.update(member).set({ role: "owner" }).where(eq(member.id, "member-a")),
  );
});

describe("evidence cleanup SQL on real PostgreSQL with explicit R2 fixtures", () => {
  it("finalizes an interrupted deletion after the R2 object is already gone", async () =>
    withPgClient(async () => {
      const hash = "d".repeat(64);
      const key = `opportunity-evidence/org-a/project-a/${hash}.json`;
      await OpportunityRepository.putSnapshot(evidence(), hash, key);
      await db.insert(opportunityEvidenceObjects).values({
        key,
        organizationId: "org-a",
        projectId: "project-a",
        contentHash: hash,
        state: "deleting",
        createdAt: aged.toISOString(),
        touchedAt: aged.toISOString(),
      });
      expect(await deleteEvidenceOrphans(context, [key])).toEqual({
        deleted: [key],
        skipped: [],
        failed: [],
      });
      expect(await db.select().from(opportunitySnapshots)).toEqual([]);
      expect(await db.select().from(opportunityEvidenceObjects)).toMatchObject([
        { key, state: "deleted", lastActorUserId: "user-a" },
      ]);
    }));
  it("deletes an aged orphan snapshot and retains its retired ownership ledger", async () =>
    withPgClient(async () => {
      const hash = "a".repeat(64);
      const key = `opportunity-evidence/org-a/project-a/${hash}.json`;
      await OpportunityRepository.putSnapshot(evidence(), hash, key);
      await db.insert(opportunityEvidenceObjects).values({
        key,
        organizationId: "org-a",
        projectId: "project-a",
        contentHash: hash,
        state: "ready",
        createdAt: aged.toISOString(),
        touchedAt: aged.toISOString(),
      });
      fakeR2Objects.set(key, { body: "retained fixture", uploaded: aged });
      expect((await previewEvidenceObjects(context)).objects).toMatchObject([
        { key, disposition: "eligible" },
      ]);
      expect(fakeR2Objects.has(key)).toBe(true);
      expect(await deleteEvidenceOrphans(context, [key])).toEqual({
        deleted: [key],
        skipped: [],
        failed: [],
      });
      expect(fakeR2Objects.has(key)).toBe(false);
      expect(await db.select().from(opportunitySnapshots)).toEqual([]);
      expect(await db.select().from(opportunityEvidenceObjects)).toMatchObject([
        { key, state: "deleted", lastActorUserId: "user-a" },
      ]);
    }));

  it("atomically adopts a deleted-project legacy object while protecting an existing-project legacy object", async () =>
    withPgClient(async () => {
      const deletedKey = `opportunity-evidence/org-a/deleted-project/${"b".repeat(64)}.json`;
      const legacyKey = `opportunity-evidence/org-a/project-a/${"c".repeat(64)}.json`;
      fakeR2Objects.set(deletedKey, {
        body: "deleted project fixture",
        uploaded: aged,
      });
      fakeR2Objects.set(legacyKey, {
        body: "existing project fixture",
        uploaded: aged,
      });
      const preview = await previewEvidenceObjects(context);
      expect(preview.objects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: deletedKey, disposition: "eligible" }),
          expect.objectContaining({ key: legacyKey, disposition: "legacy" }),
        ]),
      );
      expect(
        await deleteEvidenceOrphans(context, [deletedKey, legacyKey]),
      ).toEqual({
        deleted: [deletedKey],
        skipped: [{ key: legacyKey, reason: "legacy" }],
        failed: [],
      });
      expect(fakeR2Objects.has(deletedKey)).toBe(false);
      expect(fakeR2Objects.has(legacyKey)).toBe(true);
      expect(await db.select().from(opportunityEvidenceObjects)).toMatchObject([
        {
          key: deletedKey,
          projectId: "deleted-project",
          state: "deleted",
          lastActorUserId: "user-a",
        },
      ]);
    }));
});
