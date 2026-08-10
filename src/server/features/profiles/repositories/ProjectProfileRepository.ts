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
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { keywordFitVerdicts, projectProfiles } from "@/db/schema";
import type { ServiceAreaKind } from "@/shared/keyword-fit/profileTypes";

type ProjectProfileRow = typeof projectProfiles.$inferSelect;
type KeywordFitVerdictRow = typeof keywordFitVerdicts.$inferSelect;

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

type SaveProfileInput = {
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

/**
 * Takes ownership of drafting this project's profile, exactly once.
 *
 * Inserts an EMPTY unconfirmed `ai` row and reports whether this caller is
 * the one that created it. The atomicity comes from
 * `project_profiles_project_idx` (one row per project) rather than from a
 * transaction: the insert either wins or conflicts, and there is no window
 * between checking and writing for a second caller to slip through. A
 * read-then-insert would have one, and the profile card is mounted on several
 * tabs, so concurrent callers are the normal case rather than the exotic one.
 *
 * The claimed row is deliberately left behind when drafting then fails. It is
 * the record that we already tried, which is what stops a site we cannot read
 * from being re-crawled on every single page load — the whole reason this is
 * a claim and not just an existence check.
 */
async function claimForDraft(projectId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const claimed = await db
    .insert(projectProfiles)
    .values({
      id: crypto.randomUUID(),
      projectId,
      offer: "",
      customer: "",
      exclusions: "",
      brandTerms: "",
      serviceAreaKind: "national",
      source: "ai",
      draftedAt: now,
      confirmedAt: null,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: projectProfiles.projectId })
    .returning({ id: projectProfiles.id });
  return claimed.length > 0;
}

type DraftFields = {
  offer: string;
  customer: string;
  exclusions: string;
  brandTerms: string;
  serviceAreaKind: ServiceAreaKind;
};

/**
 * Fills in a claimed draft — but only while nobody has confirmed it.
 *
 * The `confirmedAt IS NULL` guard closes a real race, not a theoretical one:
 * drafting measured 16 seconds against a live site, and the card is editable
 * throughout. A user who types their own answer and presses Save during that
 * window must not have it silently replaced by the model's guess arriving
 * afterwards.
 */
async function applyDraft(
  projectId: string,
  draft: DraftFields,
): Promise<void> {
  await db
    .update(projectProfiles)
    .set({ ...draft, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(projectProfiles.projectId, projectId),
        isNull(projectProfiles.confirmedAt),
      ),
    );
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
      and(
        eq(keywordFitVerdicts.projectId, projectId),
        inArray(keywordFitVerdicts.keyword, [...keywords]),
      ),
    );
}

export type VerdictInput = {
  keyword: string;
  verdict: "on-offer" | "adjacent" | "wrong-customer";
  reason: string;
  source: "rules" | "ai";
};

/**
 * Stores a batch of verdicts, replacing any existing row for the same
 * (project, keyword).
 *
 * Replace rather than skip-if-present: the AI pass supersedes a rules verdict
 * for the same keyword, and the newest write is always the better-informed
 * one. `source` records which produced the row that survived.
 */
async function upsertVerdicts(
  projectId: string,
  verdicts: readonly VerdictInput[],
): Promise<void> {
  if (verdicts.length === 0) return;
  const createdAt = new Date().toISOString();
  // One statement per row rather than a single multi-row insert: D1 caps
  // bound parameters per statement, and a 100-keyword run would sit close
  // enough to that ceiling to be worth not finding out about in production.
  await runBatch((tx) =>
    verdicts.map((entry) =>
      tx
        .insert(keywordFitVerdicts)
        .values({
          id: crypto.randomUUID(),
          projectId,
          keyword: entry.keyword,
          verdict: entry.verdict,
          reason: entry.reason,
          source: entry.source,
          createdAt,
        })
        .onConflictDoUpdate({
          target: [keywordFitVerdicts.projectId, keywordFitVerdicts.keyword],
          set: {
            verdict: entry.verdict,
            reason: entry.reason,
            source: entry.source,
            createdAt,
          },
        }),
    ),
  );
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
  claimForDraft,
  applyDraft,
  listVerdicts,
  upsertVerdicts,
  clearVerdicts,
} as const;
