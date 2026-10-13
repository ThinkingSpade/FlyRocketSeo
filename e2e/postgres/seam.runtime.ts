import { eq, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { db, withPgClient } from "@/db";
import { projects, opportunityEvidenceObjects } from "@/db/schema";
import { runBatch } from "@/db/runBatch";
import {
  claimEvidenceWrite,
  releaseEvidenceWrite,
} from "@/server/features/opportunities/evidenceOwnership";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { scope, migrationDb, migrationClient } from "./runtime.fixture";

describe("production PostgreSQL seam and ownership", () => {
  it("applies all committed migrations and safely replays the migrator", async () => {
    const journal = z
      .object({ entries: z.array(z.unknown()) })
      .parse(JSON.parse(readFileSync("drizzle-pg/meta/_journal.json", "utf8")));
    const initial =
      await migrationClient`SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations`;
    expect(initial[0].count).toBe(journal.entries.length);
    await migrate(migrationDb, { migrationsFolder: "drizzle-pg" });
    expect(
      (
        await migrationClient`SELECT count(*)::integer AS count FROM drizzle.__drizzle_migrations`
      )[0].count,
    ).toBe(journal.entries.length);
    expect(is(projects, PgTable)).toBe(true);
    expect(
      (await migrationClient`SELECT version() AS version`)[0].version,
    ).toMatch(/^PostgreSQL /);
  });

  it("requires request scopes, reuses nested clients and isolates separate clients", async () => {
    expect(() => db.select()).toThrow("outside a request scope");
    const first = await withPgClient(async () => {
      const before = (
        await db
          .select({ pid: sql<number>`pg_backend_pid()` })
          .from(projects)
          .limit(1)
      )[0].pid;
      const nested = await withPgClient(
        async () =>
          (
            await db
              .select({ pid: sql<number>`pg_backend_pid()` })
              .from(projects)
              .limit(1)
          )[0].pid,
      );
      expect(nested).toBe(before);
      return before;
    });
    const second = await withPgClient(
      async () =>
        (
          await db
            .select({ pid: sql<number>`pg_backend_pid()` })
            .from(projects)
            .limit(1)
        )[0].pid,
    );
    expect(second).not.toBe(first);
  });

  it("executes relational project and auth queries using the runtime PostgreSQL schema", async () =>
    withPgClient(async () => {
      expect(await ProjectRepository.listProjects("org-a")).toMatchObject([
        { id: "project-a" },
      ]);
      expect(
        await ProjectRepository.getProjectForOrganization("project-a", "org-b"),
      ).toBeNull();
      expect(await AuthRepository.getHostedUser("user-a")).toEqual({
        id: "user-a",
        email: "alice@example.test",
        name: "Alice",
      });
      expect(
        await AuthRepository.findFirstOrganizationIdForUser("user-a"),
      ).toBe("org-a");
      await ProjectRepository.archiveProject("project-a", "org-a");
      expect(await ProjectRepository.listProjects("org-a")).toEqual([]);
      expect(
        await ProjectRepository.listArchivedProjects("org-a"),
      ).toMatchObject([{ id: "project-a" }]);
      await ProjectRepository.restoreProject("project-a", "org-a");
      expect(await ProjectRepository.listProjects("org-a")).toMatchObject([
        { id: "project-a" },
      ]);
    }));

  it("fences concurrent evidence writes, refuses retired keys and preserves the cleanup ledger after deletion", async () => {
    const key = "opportunity-evidence/org-a/project-a/fenced.json";
    const claims = await Promise.allSettled(
      [1, 2].map(() =>
        withPgClient(() => claimEvidenceWrite(scope, key, "fenced")),
      ),
    );
    expect(
      claims.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(claims.find((result) => result.status === "rejected")).toMatchObject(
      { reason: { code: "CONFLICT" } },
    );
    const accepted = claims.find((result) => result.status === "fulfilled");
    if (!accepted || accepted.status !== "fulfilled")
      throw new Error("No writer owns evidence");
    await withPgClient(async () => {
      await releaseEvidenceWrite(key, "wrong-owner");
      expect(
        (await db.select().from(opportunityEvidenceObjects))[0].state,
      ).toBe("writing");
      await releaseEvidenceWrite(key, accepted.value);
      expect(
        (await db.select().from(opportunityEvidenceObjects))[0],
      ).toMatchObject({ state: "ready", ownerToken: null });
      await db.delete(projects).where(eq(projects.id, "project-a"));
      expect(
        (await db.select().from(opportunityEvidenceObjects))[0],
      ).toMatchObject({ key, projectId: "project-a", state: "ready" });
      await db
        .update(opportunityEvidenceObjects)
        .set({ state: "deleting" })
        .where(eq(opportunityEvidenceObjects.key, key));
      await expect(
        claimEvidenceWrite(scope, key, "fenced"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await db
        .update(opportunityEvidenceObjects)
        .set({ state: "deleted" })
        .where(eq(opportunityEvidenceObjects.key, key));
      await expect(
        claimEvidenceWrite(scope, key, "fenced"),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  it("rolls back ordered batch writes when a later statement fails", async () =>
    withPgClient(async () => {
      await expect(
        runBatch((tx) => [
          tx.insert(projects).values({
            id: "rolled-back",
            organizationId: "org-a",
            name: "Rollback",
          }),
          tx.insert(projects).values({
            id: "project-a",
            organizationId: "org-a",
            name: "Duplicate",
          }),
        ]),
      ).rejects.toThrow();
      expect(
        await db.select().from(projects).where(eq(projects.id, "rolled-back")),
      ).toEqual([]);
    }));
});
