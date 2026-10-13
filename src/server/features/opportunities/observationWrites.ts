import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { opportunities, opportunityEvents } from "@/db/schema";
import { runBatch } from "@/db/runBatch";
import { AppError } from "@/server/lib/errors";
import { opportunityFindingSchema } from "@/types/schemas/opportunities";
import type {
  EvidenceScope,
  EvidenceWindow,
  Opportunity,
  OpportunityFinding,
} from "@/shared/opportunities";
import { matchingWeekdays } from "./detectors";
import { snapshot, hydrate, scopeWhere } from "./repositoryQueries";
import type { Scope } from "./repositoryTypes";
type Upsert = {
  scope: EvidenceScope;
  scopeKey: string;
  dedupeKey: string;
  detectorId: string;
  detectorVersion: string;
  finding: OpportunityFinding;
  snapshotId: string;
  actorUserId: string | null;
};
export async function upsertFinding(input: Upsert): Promise<Opportunity> {
  // The snapshot lookup also prevents an otherwise valid foreign snapshot id.
  await snapshot(input.scope, input.snapshotId);
  const finding = opportunityFindingSchema.parse(input.finding);
  const { evidence: _evidence, ...generated } = finding;
  const now = finding.evidence.fetchedAt;
  const mutationId = crypto.randomUUID();
  await runBatch((tx) => [
    tx
      .insert(opportunities)
      .values({
        id: crypto.randomUUID(),
        organizationId: input.scope.organizationId,
        projectId: input.scope.projectId,
        target: input.scope.target,
        scopeKey: input.scopeKey,
        dedupeKey: input.dedupeKey,
        detectorId: input.detectorId,
        detectorVersion: input.detectorVersion,
        kind: finding.kind,
        priorityBand: finding.priorityBand,
        generatedJson: JSON.stringify(generated),
        evidenceSnapshotId: input.snapshotId,
        firstSeenAt: now,
        lastSeenAt: now,
        lastEvaluatedAt: now,
        mutationId,
      })
      .onConflictDoUpdate({
        target: [
          opportunities.organizationId,
          opportunities.projectId,
          opportunities.target,
          opportunities.dedupeKey,
        ],
        set: {
          generatedJson: JSON.stringify(generated),
          priorityBand: finding.priorityBand,
          evidenceSnapshotId: input.snapshotId,
          detectorVersion: input.detectorVersion,
          lastSeenAt: now,
          lastEvaluatedAt: now,
          observationState: "observed",
          revision: sql`${opportunities.revision}+1`,
          mutationId,
        },
        setWhere: sql`${opportunities.lastEvaluatedAt} <= ${now}`,
      }),
    tx.insert(opportunityEvents).select(
      tx
        .select({
          id: sql<string>`${mutationId}`.as("id"),
          organizationId: opportunities.organizationId,
          projectId: opportunities.projectId,
          opportunityId: opportunities.id,
          actorUserId: sql<string | null>`${input.actorUserId}`.as(
            "actor_user_id",
          ),
          createdAt: sql<string>`${now}`.as("created_at"),
          kind: sql<
            "created" | "observed"
          >`CASE WHEN ${opportunities.revision}=1 THEN 'created' ELSE 'observed' END`.as(
            "kind",
          ),
          note: sql<string | null>`NULL`.as("note"),
          resultJson: sql<string | null>`NULL`.as("result_json"),
          revision: opportunities.revision,
          status: opportunities.status,
          evidenceSnapshotId: opportunities.evidenceSnapshotId,
        })
        .from(opportunities)
        .where(
          and(
            scopeWhere(input.scope),
            eq(opportunities.mutationId, mutationId),
          ),
        ),
    ),
  ]);
  const [row] = await db
    .select()
    .from(opportunities)
    .where(
      and(
        scopeWhere(input.scope),
        eq(opportunities.dedupeKey, input.dedupeKey),
      ),
    )
    .limit(1);
  if (!row) throw new AppError("INTERNAL_ERROR");
  return hydrate(row);
}

export async function reconcileObserved(
  scope: Scope,
  run: {
    scopeKey: string;
    detectorId: string;
    observedDedupeKeys: string[];
    complete: boolean;
    fetchedAt: string;
    window?: EvidenceWindow;
    examinedDedupeKey?: string;
    evidenceSnapshotId?: string;
  },
) {
  const {
    scopeKey,
    detectorId,
    observedDedupeKeys,
    complete,
    fetchedAt,
    window,
    examinedDedupeKey,
    evidenceSnapshotId,
  } = run;
  if (!complete) return;
  if (evidenceSnapshotId) await snapshot(scope, evidenceSnapshotId);
  const rows = await db
    .select()
    .from(opportunities)
    .where(
      and(
        scopeWhere(scope),
        eq(opportunities.scopeKey, scopeKey),
        eq(opportunities.detectorId, detectorId),
        eq(opportunities.observationState, "observed"),
        examinedDedupeKey === undefined
          ? undefined
          : eq(opportunities.dedupeKey, examinedDedupeKey),
      ),
    );
  const observed = new Set(observedDedupeKeys);
  for (const row of rows) {
    if (observed.has(row.dedupeKey) || row.lastEvaluatedAt > fetchedAt)
      continue;
    if (
      window &&
      !matchingWeekdays(
        (await snapshot(scope, row.evidenceSnapshotId)).window,
        window,
      )
    )
      continue;
    const mutationId = crypto.randomUUID();
    await runBatch((tx) => [
      tx
        .update(opportunities)
        .set({
          observationState: "no_longer_observed",
          lastEvaluatedAt: fetchedAt,
          revision: sql`${opportunities.revision}+1`,
          mutationId,
        })
        .where(
          and(
            scopeWhere(scope),
            eq(opportunities.id, row.id),
            eq(opportunities.revision, row.revision),
          ),
        ),
      tx.insert(opportunityEvents).select(
        tx
          .select({
            id: sql<string>`${mutationId}`.as("id"),
            organizationId: opportunities.organizationId,
            projectId: opportunities.projectId,
            opportunityId: opportunities.id,
            actorUserId: sql<string | null>`NULL`.as("actor_user_id"),
            createdAt: sql<string>`${fetchedAt}`.as("created_at"),
            kind: sql<"no_longer_observed">`'no_longer_observed'`.as("kind"),
            note: sql<string>`'Not observed in a complete comparable rerun. This does not verify a fix.'`.as(
              "note",
            ),
            resultJson: sql<string | null>`NULL`.as("result_json"),
            revision: opportunities.revision,
            status: opportunities.status,
            evidenceSnapshotId: evidenceSnapshotId
              ? sql<string>`${evidenceSnapshotId}`.as("evidence_snapshot_id")
              : opportunities.evidenceSnapshotId,
          })
          .from(opportunities)
          .where(
            and(
              scopeWhere(scope),
              eq(opportunities.id, row.id),
              eq(opportunities.mutationId, mutationId),
            ),
          ),
      ),
    ]);
  }
}
