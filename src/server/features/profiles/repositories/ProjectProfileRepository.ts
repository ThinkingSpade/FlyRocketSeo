/**
 * Data access for `project_profiles` (src/db/app.schema.ts / pg/app.schema.ts
 * — read that table's own header first for why geography deliberately is NOT
 * stored here).
 *
 * One row per project, enforced by `project_profiles_project_idx`, so every
 * write is an upsert keyed on `projectId` rather than an insert plus a
 * caller-side existence check — two callers racing the profile editor would
 * otherwise hit the unique index instead of the second simply winning.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { keywordFitVerdicts, projectProfiles } from "@/db/schema";
import type { ServiceAreaKind } from "@/shared/keyword-fit/profileTypes";

export type ProjectProfileRow = typeof projectProfiles.$inferSelect;
export type KeywordFitVerdictRow = typeof keywordFitVerdicts.$inferSelect;

async function getByProject(
  projectId: string,
): Promise<ProjectProfileRow | null> {
  const rows = await db
    .select()
    .from(projectProfiles)
    .where(eq(projectProfiles.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

export type SaveProfileInput = {
  projectId: string;
  offer: string;
  customer: string;
  exclusions: string;
  brandTerms: string;
  serviceAreaKind: ServiceAreaKind;
  source: "ai" | "manual";
  /** Null leaves the row unconfirmed — an AI draft awaiting a human. */
  confirmedAt: string | null;
};

/**
 * Creates or replaces this project's profile.
 *
 * `confirmedAt` is written explicitly rather than defaulted, because the
 * difference between a draft and an accepted profile is the entire point of
 * the column: `saveProjectProfile` (a human pressing Save) passes a
 * timestamp, and the Phase 2 drafting path passes null. Timestamps are plain
 * ISO strings for the same reason TargetAreaRepository computes its own —
 * both schemas store them as text so app-written and DB-defaulted values sort
 * together as strings.
 */
async function upsert(input: SaveProfileInput): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(projectProfiles)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      offer: input.offer,
      customer: input.customer,
      exclusions: input.exclusions,
      brandTerms: input.brandTerms,
      serviceAreaKind: input.serviceAreaKind,
      source: input.source,
      draftedAt: input.source === "ai" ? now : null,
      confirmedAt: input.confirmedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: projectProfiles.projectId,
      set: {
        offer: input.offer,
        customer: input.customer,
        exclusions: input.exclusions,
        brandTerms: input.brandTerms,
        serviceAreaKind: input.serviceAreaKind,
        source: input.source,
        confirmedAt: input.confirmedAt,
        updatedAt: now,
      },
    });
}

async function listVerdicts(
  projectId: string,
  keywords: readonly string[],
): Promise<KeywordFitVerdictRow[]> {
  if (keywords.length === 0) return [];
  return db
    .select()
    .from(keywordFitVerdicts)
    .where(
      // Both halves are required: the unique index is (project, keyword), and
      // without the project filter this would return another project's cached
      // verdicts for the same keyword — verdicts are only meaningful against
      // the profile that produced them.
      inArray(keywordFitVerdicts.keyword, [...keywords]),
    )
    .then((rows) => rows.filter((row) => row.projectId === projectId));
}

/**
 * Drops every cached verdict for a project.
 *
 * Called whenever the profile changes: a verdict is a function of the profile
 * that produced it, so an edited exclusion line must invalidate every row it
 * could have decided. Cheaper and far safer than trying to work out which
 * verdicts a given edit could have flipped.
 */
async function clearVerdicts(projectId: string): Promise<void> {
  await db
    .delete(keywordFitVerdicts)
    .where(eq(keywordFitVerdicts.projectId, projectId));
}

export const ProjectProfileRepository = {
  getByProject,
  upsert,
  listVerdicts,
  clearVerdicts,
} as const;
