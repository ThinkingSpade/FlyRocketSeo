/**
 * Data access for `project_target_areas` (src/db/app.schema.ts / pg/app.schema.ts
 * — read that table's own header first for the full `confirmedAt` rationale).
 *
 * Every write that can set `isPrimary`/`confirmedAt` lives in exactly one
 * function here (`setPrimary`), and it always sets both. That single
 * chokepoint is what makes TargetAreaService's own invariant possible to
 * verify: `getTargetArea` (the read path, which runs the free-signal
 * detection cascade whenever nothing is confirmed yet) never calls this
 * function, only `confirmTargetArea`/`setTargetArea` do — see that file's
 * own header and test for the assertion this shape exists to support.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectTargetAreas } from "@/db/schema";
import { runBatch } from "@/db/runBatch";
import type { TargetAreaKind } from "@/shared/geo/types";

export type TargetAreaRow = typeof projectTargetAreas.$inferSelect;
export type TargetAreaSource = "gbp" | "gsc" | "manual";

async function listByProject(projectId: string): Promise<TargetAreaRow[]> {
  return db
    .select()
    .from(projectTargetAreas)
    .where(eq(projectTargetAreas.projectId, projectId));
}

/**
 * Replaces whichever row is currently primary for this project (if any) with
 * a new CONFIRMED primary row. Two statements, one atomic batch (`runBatch`
 * — see its own header for why this is how this codebase does an atomic
 * multi-statement write on both D1 and Postgres): unsetting the old primary
 * and inserting the new one must commit together, or the partial unique
 * index (`project_target_areas_one_primary_per_project_idx`) could
 * momentarily allow two primary rows (a constraint violation) or, the other
 * direction, briefly have none (a concurrent `getTargetArea` read would
 * wrongly see "no confirmed area" mid-write).
 *
 * `confirmedAt` is a plain JS ISO string, not a dialect-specific SQL
 * default: both schema files store it as `text`/`timestampColumn` precisely
 * so app-written and DB-defaulted timestamps sort together as strings (see
 * pg/app.schema.ts's own `isoNow` comment) — computing it here keeps this
 * the ONE place that ever produces a value for the column, alongside being
 * the one place that ever writes it at all.
 */
async function setPrimary(input: {
  projectId: string;
  kind: TargetAreaKind;
  locationCode: number;
  label: string;
  parentCountryCode: number;
  source: TargetAreaSource;
}): Promise<void> {
  const confirmedAt = new Date().toISOString();
  await runBatch((tx) => [
    tx
      .update(projectTargetAreas)
      .set({ isPrimary: false })
      .where(
        and(
          eq(projectTargetAreas.projectId, input.projectId),
          eq(projectTargetAreas.isPrimary, true),
        ),
      ),
    tx.insert(projectTargetAreas).values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      kind: input.kind,
      locationCode: input.locationCode,
      label: input.label,
      parentCountryCode: input.parentCountryCode,
      source: input.source,
      isPrimary: true,
      confirmedAt,
    }),
  ]);
}

async function clearByProject(projectId: string): Promise<void> {
  await db
    .delete(projectTargetAreas)
    .where(eq(projectTargetAreas.projectId, projectId));
}

export const TargetAreaRepository = {
  listByProject,
  setPrimary,
  clearByProject,
} as const;
