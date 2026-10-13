import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  member,
  user,
  opportunities,
  opportunitySnapshots,
  opportunityRuns,
} from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import {
  evidenceSnapshotSchema,
  opportunityFindingSchema,
  opportunityResultSchema,
} from "@/types/schemas/opportunities";
import type {
  EvidenceSnapshot,
  Opportunity,
  OpportunityRun,
  OpportunityHistory,
} from "@/shared/opportunities";
import type { Scope, Row } from "./repositoryTypes";
import { readHistory, readHistories } from "./historyQueries";
export const scopeWhere = (scope: Scope) =>
  and(
    eq(opportunities.organizationId, scope.organizationId),
    eq(opportunities.projectId, scope.projectId),
    eq(opportunities.target, scope.target),
  );

export async function snapshot(
  scope: Scope,
  id: string,
): Promise<EvidenceSnapshot> {
  const [row] = await db
    .select()
    .from(opportunitySnapshots)
    .where(
      and(
        eq(opportunitySnapshots.id, id),
        eq(opportunitySnapshots.organizationId, scope.organizationId),
        eq(opportunitySnapshots.projectId, scope.projectId),
        eq(opportunitySnapshots.target, scope.target),
      ),
    )
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND");
  return evidenceSnapshotSchema.parse(JSON.parse(row.payloadJson));
}
export async function hydrate(row: Row): Promise<Opportunity> {
  const scope = {
    organizationId: row.organizationId,
    projectId: row.projectId,
    target: row.target,
  };
  const [evidence, events] = await Promise.all([
    snapshot(scope, row.evidenceSnapshotId),
    readHistory(scope, row.id),
  ]);
  const generated = opportunityFindingSchema.parse({
    ...JSON.parse(row.generatedJson),
    evidence,
  });
  return {
    ...generated,
    id: row.id,
    projectId: row.projectId,
    target: row.target,
    status: row.status,
    observationState: row.observationState,
    assigneeUserId: row.assigneeUserId,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    implementedAt: row.implementedAt,
    revision: row.revision,
    result: row.resultJson
      ? opportunityResultSchema.parse(JSON.parse(row.resultJson))
      : null,
    history: events.events,
    historyCoverage: {
      hasMore: events.hasMore,
      beforeRevision: events.beforeRevision,
    },
  };
}
export async function getRow(scope: Scope, id: string) {
  const [row] = await db
    .select()
    .from(opportunities)
    .where(and(scopeWhere(scope), eq(opportunities.id, id)))
    .limit(1);
  return row ?? null;
}
export async function get(
  scope: Scope,
  id: string,
): Promise<Opportunity | null> {
  const row = await getRow(scope, id);
  return row ? hydrate(row) : null;
}
export async function history(
  scope: Scope,
  id: string,
  beforeRevision?: number,
) {
  if (!(await getRow(scope, id))) throw new AppError("NOT_FOUND");
  return readHistory(scope, id, beforeRevision);
}
export async function list(scope: Scope, limit = 100): Promise<Opportunity[]> {
  const rows = await db
    .select()
    .from(opportunities)
    .where(scopeWhere(scope))
    .orderBy(
      sql`CASE WHEN ${opportunities.status} IN ('dismissed','measured') THEN 1 ELSE 0 END`,
      sql`CASE WHEN ${opportunities.observationState}='no_longer_observed' THEN 1 ELSE 0 END`,
      sql`CASE ${opportunities.priorityBand} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
      desc(opportunities.lastSeenAt),
      opportunities.id,
    )
    .limit(Math.min(limit, 101));
  if (!rows.length) return [];
  const snapshots = new Map<string, EvidenceSnapshot>();
  const histories = new Map<string, OpportunityHistory>();
  // Keep IN clauses below D1's parameter ceiling. At most five reads for 101 tasks.
  for (let offset = 0; offset < rows.length; offset += 80) {
    const chunk = rows.slice(offset, offset + 80);
    const [captured, events] = await Promise.all([
      db
        .select()
        .from(opportunitySnapshots)
        .where(
          and(
            eq(opportunitySnapshots.organizationId, scope.organizationId),
            eq(opportunitySnapshots.projectId, scope.projectId),
            eq(opportunitySnapshots.target, scope.target),
            inArray(
              opportunitySnapshots.id,
              chunk.map((row) => row.evidenceSnapshotId),
            ),
          ),
        ),
      readHistories(
        scope,
        chunk.map((row) => row.id),
      ),
    ]);
    for (const row of captured)
      snapshots.set(
        row.id,
        evidenceSnapshotSchema.parse(JSON.parse(row.payloadJson)),
      );
    for (const [id, eventPage] of events) histories.set(id, eventPage);
  }
  return rows.map((row) => {
    const evidence = snapshots.get(row.evidenceSnapshotId);
    if (!evidence) throw new AppError("NOT_FOUND");
    const generated = opportunityFindingSchema.parse({
      ...JSON.parse(row.generatedJson),
      evidence,
    });
    return {
      ...generated,
      id: row.id,
      projectId: row.projectId,
      target: row.target,
      status: row.status,
      observationState: row.observationState,
      assigneeUserId: row.assigneeUserId,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      implementedAt: row.implementedAt,
      revision: row.revision,
      result: row.resultJson
        ? opportunityResultSchema.parse(JSON.parse(row.resultJson))
        : null,
      history: histories.get(row.id)?.events ?? [],
      historyCoverage: {
        hasMore: histories.get(row.id)?.hasMore ?? false,
        beforeRevision: histories.get(row.id)?.beforeRevision ?? null,
      },
    };
  });
}
export async function putSnapshot(
  evidence: EvidenceSnapshot,
  contentHash: string,
  r2Key: string,
) {
  const value = evidenceSnapshotSchema.parse(evidence);
  await db
    .insert(opportunitySnapshots)
    .values({
      id: contentHash,
      organizationId: value.scope.organizationId,
      projectId: value.scope.projectId,
      target: value.scope.target,
      schemaVersion: 1,
      contentHash,
      payloadJson: JSON.stringify(value),
      r2Key,
      fetchedAt: value.fetchedAt,
    })
    .onConflictDoNothing();
}

export async function listAssignees(organizationId: string) {
  return db
    .selectDistinct({ userId: user.id, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId));
}

export async function recordRun(
  scope: Scope,
  scopeKey: string,
  run: OpportunityRun,
  detectorId: string,
  detectorVersion: string,
) {
  await db.insert(opportunityRuns).values({
    ...scope,
    scopeKey,
    id: run.id,
    fetchedAt: run.fetchedAt,
    observedFrom: run.observedFrom,
    observedTo: run.observedTo,
    availability: run.availability,
    reasonsJson: JSON.stringify(run.reasons),
    detectorId,
    detectorVersion,
  });
}
export async function latestRun(scope: Scope): Promise<OpportunityRun | null> {
  const [row] = await db
    .select()
    .from(opportunityRuns)
    .where(
      and(
        eq(opportunityRuns.organizationId, scope.organizationId),
        eq(opportunityRuns.projectId, scope.projectId),
        eq(opportunityRuns.target, scope.target),
      ),
    )
    .orderBy(desc(opportunityRuns.fetchedAt))
    .limit(1);
  return row
    ? {
        id: row.id,
        fetchedAt: row.fetchedAt,
        observedFrom: row.observedFrom,
        observedTo: row.observedTo,
        availability: row.availability,
        reasons: z.array(z.string()).parse(JSON.parse(row.reasonsJson)),
      }
    : null;
}
