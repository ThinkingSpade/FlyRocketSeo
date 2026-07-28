import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gbpConnections } from "@/db/schema";

export type GbpConnection = typeof gbpConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<GbpConnection | null> {
  const rows = await db
    .select()
    .from(gbpConnections)
    .where(eq(gbpConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  locationName: string;
  // The account's own resource name ("accounts/123") -- see the column
  // comment on gbpConnections.accountName for why this is separate from
  // locationName. Required here (every NEW connection provides it); the
  // column stays nullable only to accommodate rows written before it existed.
  accountName: string;
  connectedByUserId: string;
  connectedAccountEmail: string | null;
}): Promise<GbpConnection> {
  const [row] = await db
    .insert(gbpConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: gbpConnections.projectId,
      set: {
        locationName: input.locationName,
        accountName: input.accountName,
        organizationId: input.organizationId,
        connectedByUserId: input.connectedByUserId,
        connectedAccountEmail: input.connectedAccountEmail,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert gbp_connection");
  }
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(gbpConnections)
    .where(eq(gbpConnections.projectId, projectId));
}

/** Whether this user is still the connector for any project's GBP location. */
async function existsForConnector(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: gbpConnections.id })
    .from(gbpConnections)
    .where(eq(gbpConnections.connectedByUserId, userId))
    .limit(1);
  return rows.length > 0;
}

export const GbpConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
  existsForConnector,
};
