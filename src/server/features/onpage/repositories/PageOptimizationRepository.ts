/**
 * Data access for on-page fix suggestions.
 * Provider-aware (D1 or Postgres) via the `@/db` handle.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pageOptimizations } from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";
import { planMerge } from "@/server/lib/onpage/mergeSuggestions";
import type { OptimizationStatus } from "@/server/lib/onpage/mergeSuggestions";
import type { Suggestion } from "@/server/lib/onpage/suggestions";

export type { OptimizationStatus };

async function listForProject(projectId: string) {
  return db
    .select()
    .from(pageOptimizations)
    .where(eq(pageOptimizations.projectId, projectId));
}

/**
 * Write a freshly generated set, preserving decisions the user already made.
 * The merge rules live in `planMerge` (pure + tested); this method only runs
 * the resulting inserts and deletes.
 */
async function replaceRulesSuggestions(
  projectId: string,
  suggestions: Suggestion[],
): Promise<{ added: number; kept: number; removed: number }> {
  const existing = await listForProject(projectId);
  const now = new Date().toISOString();
  const plan = planMerge(existing, suggestions, now, () => crypto.randomUUID());

  await executeInBatches(plan.rows, (tx, row) =>
    tx
      .insert(pageOptimizations)
      .values({
        id: row.id,
        projectId,
        url: row.url,
        element: row.element,
        target: row.target,
        currentValue: row.currentValue,
        suggestedValue: row.suggestedValue,
        reason: row.reason,
        source: "rules",
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          pageOptimizations.projectId,
          pageOptimizations.url,
          pageOptimizations.element,
          pageOptimizations.target,
        ],
        set: {
          currentValue: row.currentValue,
          suggestedValue: row.suggestedValue,
          reason: row.reason,
          status: row.status,
          updatedAt: now,
        },
      }),
  );

  await executeInBatches(plan.staleIds, (tx, id) =>
    tx
      .delete(pageOptimizations)
      .where(
        and(
          eq(pageOptimizations.projectId, projectId),
          eq(pageOptimizations.id, id),
        ),
      ),
  );

  return { added: plan.added, kept: plan.kept, removed: plan.staleIds.length };
}

/** Approve or exclude suggestions, scoped to the project that owns them. */
async function setStatus(
  projectId: string,
  ids: string[],
  status: OptimizationStatus,
): Promise<void> {
  const now = new Date().toISOString();
  await executeInBatches(ids, (tx, id) =>
    tx
      .update(pageOptimizations)
      .set({ status, updatedAt: now })
      .where(
        and(
          eq(pageOptimizations.projectId, projectId),
          eq(pageOptimizations.id, id),
        ),
      ),
  );
}

/** Overwrite the text of one suggestion — used by the AI rewrite pass. */
async function updateSuggestedValues(
  projectId: string,
  updates: Array<{ id: string; suggestedValue: string; reason: string }>,
): Promise<void> {
  const now = new Date().toISOString();
  await executeInBatches(updates, (tx, update) =>
    tx
      .update(pageOptimizations)
      .set({
        suggestedValue: update.suggestedValue,
        reason: update.reason,
        source: "ai",
        status: "pending",
        updatedAt: now,
      })
      .where(
        and(
          eq(pageOptimizations.projectId, projectId),
          eq(pageOptimizations.id, update.id),
        ),
      ),
  );
}

/** Used by the AI pass to fetch exactly the rows it was asked to rewrite. */
async function listByIds(projectId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(pageOptimizations)
    .where(
      and(
        eq(pageOptimizations.projectId, projectId),
        inArray(pageOptimizations.id, ids),
      ),
    );
}

export const PageOptimizationRepository = {
  listForProject,
  listByIds,
  replaceRulesSuggestions,
  setStatus,
  updateSuggestedValues,
} as const;
