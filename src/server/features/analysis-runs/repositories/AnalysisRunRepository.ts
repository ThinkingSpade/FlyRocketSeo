/**
 * Data access for the cross-tab analysis-run history (D1 or Postgres via the
 * provider-aware `@/db` handle).
 *
 * Rows are keyed by (project, feature, cacheKey), so re-running the same
 * analysis bumps `runCount`/`lastRanAt` instead of appending a duplicate. The
 * result payload lives in R2 under `cacheKey` — never here.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { analysisRuns } from "@/db/schema";

type AnalysisRunRow = typeof analysisRuns.$inferSelect;

type RecordRunInput = {
  projectId: string;
  feature: string;
  paramsJson: string;
  cacheKey: string;
  label: string;
  ranBy: string | null;
};

/** Insert a run, or bump the existing row for the same inputs. */
async function record(input: RecordRunInput): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(analysisRuns)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      feature: input.feature,
      paramsJson: input.paramsJson,
      cacheKey: input.cacheKey,
      label: input.label,
      ranBy: input.ranBy,
      runCount: 1,
      createdAt: now,
      lastRanAt: now,
    })
    .onConflictDoUpdate({
      target: [
        analysisRuns.projectId,
        analysisRuns.feature,
        analysisRuns.cacheKey,
      ],
      set: {
        lastRanAt: now,
        // Same expression is valid in both SQLite and Postgres.
        runCount: sql`${analysisRuns.runCount} + 1`,
        label: input.label,
        paramsJson: input.paramsJson,
        ranBy: input.ranBy,
      },
    });
}

/** Most recently run analyses for one tab, newest first. */
async function listRecent(
  projectId: string,
  feature: string,
  limit: number,
): Promise<AnalysisRunRow[]> {
  return db
    .select()
    .from(analysisRuns)
    .where(
      and(
        eq(analysisRuns.projectId, projectId),
        eq(analysisRuns.feature, feature),
      ),
    )
    .orderBy(desc(analysisRuns.lastRanAt))
    .limit(limit);
}

/** One run by id, scoped to its project so ids can't be probed across tenants. */
async function getById(
  projectId: string,
  runId: string,
): Promise<AnalysisRunRow | null> {
  const rows = await db
    .select()
    .from(analysisRuns)
    .where(
      and(eq(analysisRuns.projectId, projectId), eq(analysisRuns.id, runId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** The single most recent run for a tab — what auto-restore renders. */
async function latest(
  projectId: string,
  feature: string,
): Promise<AnalysisRunRow | null> {
  const rows = await listRecent(projectId, feature, 1);
  return rows[0] ?? null;
}

export const AnalysisRunRepository = {
  record,
  listRecent,
  latest,
  getById,
} as const;
