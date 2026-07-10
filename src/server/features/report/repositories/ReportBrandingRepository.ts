import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projectReportSettings } from "@/db/schema";

type BrandingRow = typeof projectReportSettings.$inferSelect;

async function getForProject(projectId: string): Promise<BrandingRow | null> {
  const [row] = await db
    .select()
    .from(projectReportSettings)
    .where(eq(projectReportSettings.projectId, projectId))
    .limit(1);
  return row ?? null;
}

/** Full replace: the editor submits every field, so absent values clear. */
async function upsert(
  projectId: string,
  input: {
    brandName?: string;
    preparedBy?: string;
    logoDataUri?: string | null;
  },
): Promise<BrandingRow> {
  const values = {
    brandName: input.brandName ?? null,
    preparedBy: input.preparedBy ?? null,
    logoDataUri: input.logoDataUri ?? null,
    updatedAt: new Date().toISOString(),
  };
  const [row] = await db
    .insert(projectReportSettings)
    .values({ projectId, ...values })
    .onConflictDoUpdate({
      target: projectReportSettings.projectId,
      set: values,
    })
    .returning();
  return row;
}

export const ReportBrandingRepository = {
  getForProject,
  upsert,
} as const;
