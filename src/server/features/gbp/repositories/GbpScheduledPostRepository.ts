import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { gbpScheduledPosts } from "@/db/schema";
import type {
  GbpCallToActionType,
  GbpScheduledPostStatus,
} from "@/client/features/local-seo/gbpPostSchedule";

export type GbpScheduledPost = typeof gbpScheduledPosts.$inferSelect;

async function create(input: {
  projectId: string;
  content: string;
  mediaUrl: string | null;
  callToActionType: GbpCallToActionType | null;
  callToActionUrl: string | null;
  scheduledAt: string;
  status: GbpScheduledPostStatus;
  createdByUserId: string;
}): Promise<GbpScheduledPost> {
  const [row] = await db
    .insert(gbpScheduledPosts)
    .values({ id: crypto.randomUUID(), ...input })
    .returning();
  if (!row) {
    throw new Error("Failed to create gbp_scheduled_post");
  }
  return row;
}

async function getById(id: string): Promise<GbpScheduledPost | null> {
  const rows = await db
    .select()
    .from(gbpScheduledPosts)
    .where(eq(gbpScheduledPosts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Newest first, so the compose UI's own list reads like an activity feed. */
async function listByProject(projectId: string): Promise<GbpScheduledPost[]> {
  return db
    .select()
    .from(gbpScheduledPosts)
    .where(eq(gbpScheduledPosts.projectId, projectId))
    .orderBy(desc(gbpScheduledPosts.scheduledAt));
}

/**
 * The double-publish guard's DB-level enforcement: an atomic, conditional
 * UPDATE that only succeeds if the row is STILL `scheduled` at the moment it
 * runs. gbpPostSchedule.ts's `canStartPublishing` is what decides a row
 * SHOULD be attempted; this is what makes two concurrent attempts at the
 * SAME row physically impossible to both win -- the WHERE clause is the
 * compare-and-swap, and `.returning()` tells the caller whether it was the
 * one that swapped. A null return means someone else (or nothing) got there
 * first; the caller must not proceed to call Google's API in that case.
 */
async function claimForPublishing(
  id: string,
): Promise<GbpScheduledPost | null> {
  const [row] = await db
    .update(gbpScheduledPosts)
    .set({ status: "publishing" })
    .where(
      and(
        eq(gbpScheduledPosts.id, id),
        eq(gbpScheduledPosts.status, "scheduled"),
      ),
    )
    .returning();
  return row ?? null;
}

async function markPublished(
  id: string,
  publishedPostId: string,
): Promise<void> {
  await db
    .update(gbpScheduledPosts)
    .set({ status: "published", publishedPostId, errorMessage: null })
    .where(eq(gbpScheduledPosts.id, id));
}

async function markFailed(id: string, errorMessage: string): Promise<void> {
  await db
    .update(gbpScheduledPosts)
    .set({ status: "failed", errorMessage })
    .where(eq(gbpScheduledPosts.id, id));
}

export const GbpScheduledPostRepository = {
  create,
  getById,
  listByProject,
  claimForPublishing,
  markPublished,
  markFailed,
};
