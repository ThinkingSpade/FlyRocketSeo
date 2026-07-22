/**
 * Data access for brand-visibility snapshots (D1 or Postgres via the `@/db`
 * handle). One row per project + target + day; a same-day re-run upserts on the
 * unique index — the PK/unique-collision upsert is the pattern verified against
 * the real SQLite engine for page_optimizations.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { brandVisibilitySnapshots } from "@/db/schema";
import type { SnapshotFields } from "@/server/lib/brand-visibility/snapshot";

export type BrandVisibilitySnapshotRow =
  typeof brandVisibilitySnapshots.$inferSelect;

/** Every snapshot for a project, oldest first (the trend sorts anyway). */
async function listForProject(
  projectId: string,
): Promise<BrandVisibilitySnapshotRow[]> {
  return db
    .select()
    .from(brandVisibilitySnapshots)
    .where(eq(brandVisibilitySnapshots.projectId, projectId))
    .orderBy(brandVisibilitySnapshots.capturedOn);
}

/**
 * Write today's snapshot, replacing an earlier one for the same day so the
 * series stays one-per-day. `id` is only used for a genuinely new row; on
 * conflict the stored row keeps its id (see the page_optimizations probe).
 */
async function upsertDaily(
  projectId: string,
  fields: SnapshotFields,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(brandVisibilitySnapshots)
    .values({
      id: crypto.randomUUID(),
      projectId,
      target: fields.target,
      capturedOn: fields.capturedOn,
      totalMentions: fields.totalMentions,
      chatgptMentions: fields.chatgptMentions,
      googleMentions: fields.googleMentions,
      targetSharePct: fields.targetSharePct,
      resultJson: fields.resultJson,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        brandVisibilitySnapshots.projectId,
        brandVisibilitySnapshots.target,
        brandVisibilitySnapshots.capturedOn,
      ],
      set: {
        totalMentions: fields.totalMentions,
        chatgptMentions: fields.chatgptMentions,
        googleMentions: fields.googleMentions,
        targetSharePct: fields.targetSharePct,
        resultJson: fields.resultJson,
        updatedAt: now,
      },
    });
}

export const BrandVisibilitySnapshotRepository = {
  listForProject,
  upsertDaily,
} as const;
