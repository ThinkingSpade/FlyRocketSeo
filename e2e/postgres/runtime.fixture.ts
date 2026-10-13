import { mkdirSync, writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { db, withPgClient } from "@/db";
import { projects, organization, user, member } from "@/db/schema";
import { OpportunityRepository } from "@/server/features/opportunities/OpportunityRepository";
import { evidence } from "@/server/features/opportunities/evidence.fixture";
import { detectDecliningPages } from "@/server/features/opportunities/detectors";
import { requireIsolatedPostgres } from "../../scripts/postgres-runtime-isolation.mjs";

export const scope = evidence().scope;
const notices: unknown[] = [];
export const migrationClient = postgres(requireIsolatedPostgres(process.env), {
  max: 1,
  fetch_types: false,
  onnotice: (notice) => notices.push(notice),
});
export const migrationDb = drizzle(migrationClient);
async function seed() {
  await db.insert(organization).values([
    { id: "org-a", name: "A", slug: "a", createdAt: new Date() },
    { id: "org-b", name: "B", slug: "b", createdAt: new Date() },
  ]);
  await db.insert(projects).values([
    {
      id: "project-a",
      organizationId: "org-a",
      name: "A",
      domain: "example.com",
    },
    {
      id: "project-b",
      organizationId: "org-b",
      name: "B",
      domain: "elsewhere.com",
    },
  ]);
  await db.insert(user).values([
    { id: "user-a", name: "Alice", email: "alice@example.test" },
    { id: "user-b", name: "Bob", email: "bob@example.test" },
  ]);
  await db.insert(member).values([
    {
      id: "member-a",
      organizationId: "org-a",
      userId: "user-a",
      createdAt: new Date(),
    },
    {
      id: "member-b",
      organizationId: "org-b",
      userId: "user-b",
      createdAt: new Date(),
    },
  ]);
}
export async function save(version = "1") {
  const captured = evidence();
  await OpportunityRepository.putSnapshot(
    captured,
    "hash-a",
    "opportunity-evidence/org-a/project-a/hash-a",
  );
  return OpportunityRepository.upsertFinding({
    scope,
    scopeKey: "scope-a",
    dedupeKey: "stable-a",
    detectorId: "page-decline",
    detectorVersion: version,
    finding: detectDecliningPages([captured])[0],
    snapshotId: "hash-a",
    actorUserId: "user-a",
  });
}
beforeAll(async () => {
  await migrate(migrationDb, { migrationsFolder: "drizzle-pg" });
});
beforeEach(async () => {
  await migrationClient.unsafe(
    'TRUNCATE "organization", "user", "opportunity_evidence_objects" CASCADE',
  );
  await withPgClient(seed);
});
afterAll(async () => {
  // Production Workers own socket lifetime. Terminate only this random test
  // database's Node sessions before the isolated runner shuts its cluster down.
  await migrationClient`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`;
  await migrationClient.end({ timeout: 2 });
  mkdirSync("test-results/postgres-runtime", { recursive: true });
  writeFileSync(
    `test-results/postgres-runtime/notices-${process.pid}.json`,
    JSON.stringify(notices, null, 2),
  );
});
