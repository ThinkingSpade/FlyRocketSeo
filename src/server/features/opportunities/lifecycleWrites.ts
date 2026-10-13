import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { member, opportunities, opportunityEvents } from "@/db/schema";
import { runBatch } from "@/db/runBatch";
import { AppError } from "@/server/lib/errors";
import type { Opportunity, OpportunityResult } from "@/shared/opportunities";
import { pacificCalendarDate } from "@/server/features/gsc/searchAnalytics";
import { compareOpportunityEvidence } from "./detectors";
import { snapshot, get, getRow, scopeWhere } from "./repositoryQueries";
import type { Scope, Row, Update } from "./repositoryTypes";
async function validateUpdate(scope: Scope, row: Row, input: Update) {
  if (input.status === "measured")
    throw new AppError(
      "VALIDATION_ERROR",
      "Comparable sufficient evidence is required before a task can be measured.",
    );
  if (input.assigneeUserId) {
    const [match] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, scope.organizationId),
          eq(member.userId, input.assigneeUserId),
        ),
      )
      .limit(1);
    if (!match)
      throw new AppError(
        "VALIDATION_ERROR",
        "Choose a member of this organization.",
      );
  }
  if (input.status === "dismissed" && !input.note?.trim())
    throw new AppError("VALIDATION_ERROR", "Record a dismissal reason.");
  if (input.status === "implemented") {
    if (!input.note?.trim())
      throw new AppError(
        "VALIDATION_ERROR",
        "Record implementation notes or an artifact reference.",
      );
    if (row.implementedAt && input.implementedAt !== row.implementedAt)
      throw new AppError(
        "VALIDATION_ERROR",
        "The recorded implementation date and baseline are immutable. This action tracks one implementation and its follow-up observations.",
      );
    const baseline = await snapshot(
      scope,
      row.baselineSnapshotId ?? row.evidenceSnapshotId,
    );
    const implemented = Date.parse(input.implementedAt ?? "");
    if (
      !Number.isFinite(implemented) ||
      pacificCalendarDate(new Date(implemented)).getTime() <
        Date.parse(baseline.window.endDate) + 86400000 ||
      implemented > Date.now()
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Record implementation after the baseline's last Pacific calendar day and no later than now.",
      );
  } else if (input.implementedAt)
    throw new AppError(
      "VALIDATION_ERROR",
      "Implementation dates are recorded with Implemented status.",
    );
  if (input.status === "results_pending" && !row.implementedAt)
    throw new AppError(
      "VALIDATION_ERROR",
      "Record implementation before measuring outcomes.",
    );
}

async function mutate(
  scope: Scope,
  row: Row,
  expectedRevision: number,
  change: {
    input: Update;
    actorUserId: string;
    measurement?: OpportunityResult;
    measurementSnapshotId?: string;
  },
): Promise<Opportunity> {
  const { input, actorUserId, measurement, measurementSnapshotId } = change;
  if (row.revision !== expectedRevision) throw new AppError("CONFLICT");
  const mutationId = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = measurement
    ? measurement.availability === "measured"
      ? "measured"
      : "results_pending"
    : (input.status ?? row.status);
  const values: Partial<typeof opportunities.$inferInsert> = {
    status,
    mutationId,
  };
  if (input.assigneeUserId !== undefined)
    values.assigneeUserId = input.assigneeUserId;
  if (input.status === "implemented") {
    values.implementedAt = input.implementedAt;
    values.baselineSnapshotId =
      row.baselineSnapshotId ?? row.evidenceSnapshotId;
    values.resultJson = null;
  }
  if (measurement) values.resultJson = JSON.stringify(measurement);
  await runBatch((tx) => [
    tx
      .update(opportunities)
      .set({ ...values, revision: sql`${opportunities.revision}+1` })
      .where(
        and(
          scopeWhere(scope),
          eq(opportunities.id, row.id),
          eq(opportunities.revision, expectedRevision),
        ),
      ),
    tx.insert(opportunityEvents).select(
      tx
        .select({
          id: sql<string>`${mutationId}`.as("id"),
          organizationId: opportunities.organizationId,
          projectId: opportunities.projectId,
          opportunityId: opportunities.id,
          actorUserId: sql<string>`${actorUserId}`.as("actor_user_id"),
          createdAt: sql<string>`${now}`.as("created_at"),
          kind: sql<
            "updated" | "measurement"
          >`${measurement ? "measurement" : "updated"}`.as("kind"),
          note: sql<string | null>`${input.note ?? null}`.as("note"),
          resultJson: sql<
            string | null
          >`${measurement ? JSON.stringify(measurement) : null}`.as(
            "result_json",
          ),
          revision: opportunities.revision,
          status: opportunities.status,
          evidenceSnapshotId:
            sql<string>`${measurementSnapshotId ?? row.evidenceSnapshotId}`.as(
              "evidence_snapshot_id",
            ),
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
  const [event] = await db
    .select({ id: opportunityEvents.id })
    .from(opportunityEvents)
    .where(eq(opportunityEvents.id, mutationId))
    .limit(1);
  if (!event) throw new AppError("CONFLICT");
  const result = await get(scope, row.id);
  if (!result) throw new AppError("NOT_FOUND");
  return result;
}
export async function update(
  scope: Scope,
  id: string,
  expectedRevision: number,
  input: Update,
  actorUserId: string,
) {
  const row = await getRow(scope, id);
  if (!row) throw new AppError("NOT_FOUND");
  await validateUpdate(scope, row, input);
  return mutate(scope, row, expectedRevision, { input, actorUserId });
}
export async function getBaseline(scope: Scope, id: string) {
  const row = await getRow(scope, id);
  if (!row?.baselineSnapshotId) return null;
  return snapshot(scope, row.baselineSnapshotId);
}
export async function storeMeasurement(
  scope: Scope,
  id: string,
  expectedRevision: number,
  afterSnapshotId: string,
  actorUserId: string,
) {
  const row = await getRow(scope, id);
  if (!row?.baselineSnapshotId || !row.implementedAt)
    throw new AppError("VALIDATION_ERROR", "Record implementation first.");
  const baseline = await snapshot(scope, row.baselineSnapshotId);
  const after = await snapshot(scope, afterSnapshotId);
  const result: OpportunityResult = {
    ...compareOpportunityEvidence(baseline, after, row.implementedAt),
    measuredAt: new Date().toISOString(),
    baseline,
    after,
  };
  return mutate(scope, row, expectedRevision, {
    input: {},
    actorUserId,
    measurement: result,
    measurementSnapshotId: afterSnapshotId,
  });
}
