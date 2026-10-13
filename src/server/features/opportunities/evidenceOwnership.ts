import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { opportunityEvidenceObjects as objects } from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import type { EvidenceScope } from "@/shared/opportunities";

/** A durable fence, held until the snapshot is attached to its task/event. */
export async function claimEvidenceWrite(
  scope: EvidenceScope,
  key: string,
  hash: string,
) {
  const ownerToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const [claimed] = await db
    .insert(objects)
    .values({
      key,
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      contentHash: hash,
      state: "writing",
      ownerToken,
      createdAt: now,
      touchedAt: now,
    })
    .onConflictDoUpdate({
      target: objects.key,
      set: { state: "writing", ownerToken, touchedAt: now },
      where: eq(objects.state, "ready"),
    })
    .returning({ key: objects.key });
  if (!claimed)
    throw new AppError(
      "CONFLICT",
      "Evidence is busy or retired; capture fresh evidence and retry.",
    );
  return ownerToken;
}

export async function releaseEvidenceWrite(key: string, ownerToken: string) {
  await db
    .update(objects)
    .set({
      state: "ready",
      ownerToken: null,
      touchedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(objects.key, key),
        eq(objects.state, "writing"),
        eq(objects.ownerToken, ownerToken),
      ),
    );
}
