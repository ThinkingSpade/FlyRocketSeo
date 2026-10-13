import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as work from "../../src/db/opportunities.schema";
import type { OpportunityFinding } from "../../src/shared/opportunities";
import {
  ORG_A,
  ORG_B,
  PROJECT_A,
  PROJECT_B,
  PROJECT_DELETED,
  CLEANUP_AUTH_KEY,
  CLEANUP_BASELINE_KEY,
  CLEANUP_BUSY_KEY,
  CLEANUP_DELETED_PROJECT_KEY,
  CLEANUP_FOREIGN_KEY,
  CLEANUP_LEGACY_KEY,
  CLEANUP_ORPHAN_KEY,
  CLEANUP_RETRY_KEY,
  CLEANUP_QUOTA_KEYS,
} from "./data";

export async function seedEvidenceStorage(
  db: DrizzleD1Database,
  r2: R2Bucket,
  finding: OpportunityFinding,
  database: D1Database,
) {
  await db.insert(work.opportunities).values({
    id: "00000000-0000-4000-8000-000000000302",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    target: "primary.example",
    scopeKey: "acceptance-storage-baseline-scope",
    dedupeKey: "acceptance-storage-baseline-dedupe",
    detectorId: "page_review",
    detectorVersion: "1",
    kind: "page_review",
    priorityBand: "low",
    generatedJson: JSON.stringify({
      ...finding,
      title: "Storage baseline acceptance fixture",
    }),
    evidenceSnapshotId: "acceptance-history-snapshot",
    baselineSnapshotId: "acceptance-history-snapshot",
    status: "implemented",
    implementedAt: "2026-09-01T12:00:00.000Z",
    firstSeenAt: finding.evidence.fetchedAt,
    lastSeenAt: finding.evidence.fetchedAt,
    lastEvaluatedAt: finding.evidence.fetchedAt,
    revision: 1,
    mutationId: "acceptance-storage-baseline-mutation",
  });
  const storageCreatedAt = new Date(
    Date.now() - 48 * 60 * 60 * 1000,
  ).toISOString();
  const storageObjects = [
    ...CLEANUP_QUOTA_KEYS.map((key, index) => ({
      key,
      organizationId: ORG_B,
      projectId: PROJECT_B,
      contentHash: String(index + 1).repeat(64),
      state: "ready" as const,
    })),
    {
      key: CLEANUP_RETRY_KEY,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      contentHash: "8".repeat(64),
      state: "ready" as const,
    },
    {
      key: CLEANUP_AUTH_KEY,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      contentHash: "9".repeat(64),
      state: "ready" as const,
    },
    {
      key: CLEANUP_ORPHAN_KEY,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      contentHash: "a".repeat(64),
      state: "ready" as const,
    },
    {
      key: CLEANUP_DELETED_PROJECT_KEY,
      organizationId: ORG_A,
      projectId: PROJECT_DELETED,
      contentHash: "c".repeat(64),
      state: "ready" as const,
    },
    {
      key: CLEANUP_FOREIGN_KEY,
      organizationId: ORG_B,
      projectId: PROJECT_B,
      contentHash: "b".repeat(64),
      state: "ready" as const,
    },
    {
      key: CLEANUP_BASELINE_KEY,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      contentHash: "d".repeat(64),
      state: "ready" as const,
    },
    {
      key: CLEANUP_BUSY_KEY,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      contentHash: "e".repeat(64),
      state: "writing" as const,
    },
  ];
  for (const object of storageObjects) {
    if (object.key !== CLEANUP_BASELINE_KEY)
      await r2.put(object.key, '{"fixture":"isolated storage cleanup"}');
    await db.insert(work.opportunityEvidenceObjects).values({
      ...object,
      ownerToken: object.state === "writing" ? "acceptance-active-write" : null,
      createdAt: storageCreatedAt,
      touchedAt: storageCreatedAt,
      lastActorUserId:
        object.organizationId === ORG_A
          ? "acceptance-user-a"
          : "acceptance-user-b",
    });
  }
  await r2.put(CLEANUP_LEGACY_KEY, '{"fixture":"protected legacy storage"}');
  // Fail SQL finalization after the actual R2 deletion for one local fixture.
  // The acceptance worker can release only this fixed test trigger.
  await database
    .prepare(
      `CREATE TRIGGER acceptance_evidence_cleanup_retry
    BEFORE UPDATE OF state ON opportunity_evidence_objects
    WHEN OLD.key = '${CLEANUP_RETRY_KEY}' AND NEW.state = 'deleted'
    BEGIN SELECT RAISE(FAIL, 'Acceptance bookkeeping failure'); END;`,
    )
    .run();
}
