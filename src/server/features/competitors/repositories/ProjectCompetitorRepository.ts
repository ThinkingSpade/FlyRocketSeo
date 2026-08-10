/**
 * Data access for `project_competitors` (src/db/app.schema.ts and its pg
 * twin). Every write normalizes the domain through the same helper the
 * discovery path uses, so a pinned "AVFUSA.com" and a discovered "avfusa.com"
 * are the same row.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectCompetitors } from "@/db/schema";
import { normalizeDomainInput } from "@/server/lib/domainUtils";

export type ProjectCompetitorRow = typeof projectCompetitors.$inferSelect;
type ProjectCompetitorStatus = "pinned" | "excluded";

async function listByProject(
  projectId: string,
): Promise<ProjectCompetitorRow[]> {
  return db
    .select()
    .from(projectCompetitors)
    .where(eq(projectCompetitors.projectId, projectId));
}

async function upsert(input: {
  projectId: string;
  domain: string;
  status: ProjectCompetitorStatus;
  note?: string;
}): Promise<void> {
  const domain = normalizeDomainInput(input.domain, true);
  const now = new Date().toISOString();
  await db
    .insert(projectCompetitors)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      domain,
      status: input.status,
      note: input.note ?? "",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [projectCompetitors.projectId, projectCompetitors.domain],
      set: { status: input.status, note: input.note ?? "", updatedAt: now },
    });
}

async function remove(input: {
  projectId: string;
  domain: string;
}): Promise<void> {
  const domain = normalizeDomainInput(input.domain, true);
  await db
    .delete(projectCompetitors)
    .where(
      and(
        eq(projectCompetitors.projectId, input.projectId),
        eq(projectCompetitors.domain, domain),
      ),
    );
}

export const ProjectCompetitorRepository = { listByProject, upsert, remove };
