import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { opportunityEvents } from "@/db/schema";
import { opportunityResultSchema } from "@/types/schemas/opportunities";
import type {
  OpportunityEvent,
  OpportunityHistory,
} from "@/shared/opportunities";
import type { Scope } from "./repositoryTypes";

const HISTORY_LIMIT = 50;
type EventRow = typeof opportunityEvents.$inferSelect;
function mapped(row: EventRow): OpportunityEvent {
  const {
    id,
    actorUserId,
    createdAt,
    kind,
    note,
    status,
    revision,
    resultJson,
  } = row;
  return {
    id,
    actorUserId,
    createdAt,
    kind,
    note,
    status,
    revision,
    result: resultJson
      ? opportunityResultSchema.parse(JSON.parse(resultJson))
      : null,
  };
}
function page(rows: EventRow[]): OpportunityHistory {
  const events = rows.slice(0, HISTORY_LIMIT).toReversed().map(mapped);
  return {
    events,
    hasMore: rows.length > HISTORY_LIMIT,
    beforeRevision: events[0]?.revision ?? null,
  };
}
export async function readHistory(
  scope: Scope,
  id: string,
  beforeRevision?: number,
) {
  const rows = await db
    .select()
    .from(opportunityEvents)
    .where(
      and(
        eq(opportunityEvents.organizationId, scope.organizationId),
        eq(opportunityEvents.projectId, scope.projectId),
        eq(opportunityEvents.opportunityId, id),
        beforeRevision === undefined
          ? undefined
          : lt(opportunityEvents.revision, beforeRevision),
      ),
    )
    .orderBy(
      desc(opportunityEvents.revision),
      desc(opportunityEvents.createdAt),
      desc(opportunityEvents.id),
    )
    .limit(HISTORY_LIMIT + 1);
  return page(rows);
}

/** Bound each task independently without losing a busy task's neighbours. */
export async function readHistories(scope: Scope, ids: string[]) {
  const ranked = db
    .select({
      ...getTableColumns(opportunityEvents),
      rank: sql<number>`row_number() OVER (PARTITION BY ${opportunityEvents.opportunityId} ORDER BY ${opportunityEvents.revision} DESC, ${opportunityEvents.createdAt} DESC, ${opportunityEvents.id} DESC)`.as(
        "history_rank",
      ),
    })
    .from(opportunityEvents)
    .where(
      and(
        eq(opportunityEvents.organizationId, scope.organizationId),
        eq(opportunityEvents.projectId, scope.projectId),
        inArray(opportunityEvents.opportunityId, ids),
      ),
    )
    .as("ranked_history");
  const rows = await db
    .select()
    .from(ranked)
    .where(lte(ranked.rank, HISTORY_LIMIT + 1))
    .orderBy(
      ranked.opportunityId,
      desc(ranked.revision),
      desc(ranked.createdAt),
      desc(ranked.id),
    );
  const grouped = new Map<string, EventRow[]>();
  for (const row of rows) {
    const events = grouped.get(row.opportunityId) ?? [];
    events.push(row);
    grouped.set(row.opportunityId, events);
  }
  return new Map([...grouped].map(([id, entries]) => [id, page(entries)]));
}
