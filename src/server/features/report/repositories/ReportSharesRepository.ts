import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportShares } from "@/db/schema";
import { AppError } from "@/server/lib/errors";

// Guards a runaway integration from minting unbounded public rows; the share
// modal shows a handful, and old links can be revoked.
const MAX_SHARES_PER_PROJECT = 100;

/** 256-bit URL-safe secret — the only key the public route accepts. */
function generateShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function create(input: {
  projectId: string;
  createdByUserId: string;
  rangeKey: string;
  title: string;
  snapshotJson: string;
}) {
  const existing = await db
    .select({ id: reportShares.id })
    .from(reportShares)
    .where(eq(reportShares.projectId, input.projectId))
    .limit(MAX_SHARES_PER_PROJECT);
  if (existing.length >= MAX_SHARES_PER_PROJECT) {
    throw new AppError(
      "VALIDATION_ERROR",
      `A project can hold at most ${MAX_SHARES_PER_PROJECT} share links. Revoke old ones first.`,
    );
  }

  const [row] = await db
    .insert(reportShares)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      token: generateShareToken(),
      rangeKey: input.rangeKey,
      title: input.title,
      snapshotJson: input.snapshotJson,
      createdByUserId: input.createdByUserId,
    })
    .returning({
      id: reportShares.id,
      token: reportShares.token,
      rangeKey: reportShares.rangeKey,
      title: reportShares.title,
      createdAt: reportShares.createdAt,
    });
  return row;
}

/** Newest first, without snapshot bodies — the list stays light. */
async function listForProject(projectId: string) {
  return db
    .select({
      id: reportShares.id,
      token: reportShares.token,
      rangeKey: reportShares.rangeKey,
      title: reportShares.title,
      createdAt: reportShares.createdAt,
      revokedAt: reportShares.revokedAt,
    })
    .from(reportShares)
    .where(eq(reportShares.projectId, projectId))
    .orderBy(desc(reportShares.createdAt), desc(reportShares.id))
    .limit(MAX_SHARES_PER_PROJECT);
}

/** The public route's single lookup. Revoked shares read as missing. */
async function findActiveByToken(token: string) {
  const [row] = await db
    .select({
      title: reportShares.title,
      rangeKey: reportShares.rangeKey,
      createdAt: reportShares.createdAt,
      snapshotJson: reportShares.snapshotJson,
    })
    .from(reportShares)
    .where(and(eq(reportShares.token, token), isNull(reportShares.revokedAt)))
    .limit(1);
  return row ?? null;
}

async function revoke(projectId: string, shareId: string): Promise<void> {
  const updated = await db
    .update(reportShares)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(eq(reportShares.id, shareId), eq(reportShares.projectId, projectId)),
    )
    .returning({ id: reportShares.id });
  if (updated.length === 0) {
    throw new AppError("NOT_FOUND");
  }
}

export const ReportSharesRepository = {
  create,
  listForProject,
  findActiveByToken,
  revoke,
} as const;
