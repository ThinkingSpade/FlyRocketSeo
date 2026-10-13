import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  member,
  projects,
  opportunityEvidenceObjects as objects,
  opportunitySnapshots as snapshots,
  opportunities,
  opportunityEvents,
} from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import {
  CLEANUP_BATCH_SIZE,
  ORPHAN_GRACE_MS,
} from "@/server/features/opportunities/evidenceCleanupPolicy";

type Context = { organizationId: string; userId: string };
type Disposition =
  | "eligible"
  | "referenced"
  | "recent"
  | "busy"
  | "legacy"
  | "invalid";
type EvidenceCleanupObject = {
  key: string;
  projectId: string;
  uploadedAt: string;
  size: number;
  disposition: Disposition;
};
const prefix = (organizationId: string) =>
  `opportunity-evidence/${encodeURIComponent(organizationId)}/`;
function parseKey(key: string, organizationId: string) {
  if (!key.startsWith(prefix(organizationId))) return null;
  const [encodedProject, file, extra] = key
    .slice(prefix(organizationId).length)
    .split("/");
  if (
    extra !== undefined ||
    !encodedProject ||
    !/^[a-f0-9]{64}\.json$/.test(file ?? "")
  )
    return null;
  try {
    const projectId = decodeURIComponent(encodedProject);
    if (!projectId || encodeURIComponent(projectId) !== encodedProject)
      return null;
    return { projectId, contentHash: file.slice(0, -5) };
  } catch {
    return null;
  }
}
async function authorize(context: Context) {
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, context.organizationId),
        eq(member.userId, context.userId),
      ),
    )
    .limit(1);
  if (!membership || !["owner", "admin"].includes(membership.role))
    throw new AppError("FORBIDDEN");
}
const unreferencedSnapshot = sql`NOT EXISTS (SELECT 1 FROM ${opportunities} WHERE ${opportunities.evidenceSnapshotId} = ${snapshots.id} OR ${opportunities.baselineSnapshotId} = ${snapshots.id}) AND NOT EXISTS (SELECT 1 FROM ${opportunityEvents} WHERE ${opportunityEvents.evidenceSnapshotId} = ${snapshots.id})`;
const unreferencedKey = (key: string) =>
  sql`NOT EXISTS (SELECT 1 FROM ${snapshots} WHERE ${snapshots.r2Key} = ${key} AND NOT (${unreferencedSnapshot}))`;
const projectMissing = (projectId: string) =>
  sql`NOT EXISTS (SELECT 1 FROM ${projects} WHERE ${projects.id} = ${projectId})`;
async function classify(
  key: string,
  uploaded: Date,
  context: Context,
): Promise<Disposition> {
  const parsed = parseKey(key, context.organizationId);
  if (!parsed || !Number.isFinite(uploaded.getTime())) return "invalid";
  const [referenced] = await db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(and(eq(snapshots.r2Key, key), sql`NOT (${unreferencedSnapshot})`))
    .limit(1);
  if (referenced) return "referenced";
  const [ledger] = await db
    .select()
    .from(objects)
    .where(eq(objects.key, key))
    .limit(1);
  if (
    ledger &&
    (ledger.organizationId !== context.organizationId ||
      ledger.projectId !== parsed.projectId ||
      ledger.contentHash !== parsed.contentHash)
  )
    return "invalid";
  if (ledger?.state === "writing") return "busy";
  const cutoff = Date.now() - ORPHAN_GRACE_MS;
  if (
    uploaded.getTime() > cutoff ||
    (ledger &&
      (!Number.isFinite(Date.parse(ledger.touchedAt)) ||
        Date.parse(ledger.touchedAt) > cutoff))
  )
    return "recent";
  if (!ledger) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, parsed.projectId))
      .limit(1);
    if (project) return "legacy";
  }
  return "eligible";
}
export async function previewEvidenceObjects(
  context: Context,
  cursor?: string,
) {
  await authorize(context);
  const listing = await env.R2.list({
    prefix: prefix(context.organizationId),
    limit: CLEANUP_BATCH_SIZE,
    ...(cursor ? { cursor } : {}),
  });
  const results: EvidenceCleanupObject[] = [];
  const counts: Record<Disposition, number> = {
    eligible: 0,
    referenced: 0,
    recent: 0,
    busy: 0,
    legacy: 0,
    invalid: 0,
  };
  for (const object of listing.objects) {
    const disposition = await classify(object.key, object.uploaded, context);
    counts[disposition]++;
    results.push({
      key: object.key,
      projectId: parseKey(object.key, context.organizationId)?.projectId ?? "",
      uploadedAt: object.uploaded.toISOString(),
      size: object.size,
      disposition,
    });
  }
  return {
    objects: results,
    nextCursor: listing.truncated ? listing.cursor : null,
    policy: { graceHours: 24 },
    counts,
  };
}

async function claimDeletion(context: Context, key: string, uploaded: Date) {
  const parsed = parseKey(key, context.organizationId)!;
  const now = new Date().toISOString();
  // Older unfenced objects are claimable only after their project is gone.
  // The insert's project/reference conditions run in the same SQL statement.
  await db
    .insert(objects)
    .select(
      sql`SELECT ${key}, ${context.organizationId}, ${parsed.projectId}, ${parsed.contentHash}, 'deleting', NULL, ${uploaded.toISOString()}, ${uploaded.toISOString()}, ${context.userId} WHERE ${projectMissing(parsed.projectId)} AND ${unreferencedKey(key)}`,
    )
    .onConflictDoNothing();
  const [claimed] = await db
    .update(objects)
    .set({
      state: "deleting",
      ownerToken: null,
      lastActorUserId: context.userId,
    })
    .where(
      and(
        eq(objects.key, key),
        eq(objects.organizationId, context.organizationId),
        eq(objects.projectId, parsed.projectId),
        eq(objects.contentHash, parsed.contentHash),
        sql`${objects.state} IN ('ready','deleting','deleted')`,
        sql`${objects.touchedAt} <= ${new Date(Date.now() - ORPHAN_GRACE_MS).toISOString()}`,
        unreferencedKey(key),
      ),
    )
    .returning({ key: objects.key });
  // Keep original touchedAt while deleting, so an interrupted delete is immediately retryable.
  return claimed ? now : null;
}
export async function deleteEvidenceOrphans(context: Context, keys: string[]) {
  await authorize(context);
  if (keys.length > CLEANUP_BATCH_SIZE) throw new AppError("VALIDATION_ERROR");
  const result: {
    deleted: string[];
    skipped: { key: string; reason: string }[];
    failed: { key: string; reason: string }[];
  } = { deleted: [], skipped: [], failed: [] };
  for (const key of new Set(keys)) {
    if (!parseKey(key, context.organizationId)) {
      result.skipped.push({
        key,
        reason: key.startsWith(prefix(context.organizationId))
          ? "invalid"
          : "outside_scope",
      });
      continue;
    }
    try {
      const object = await env.R2.head(key);
      if (!object) {
        // R2 may have succeeded before SQL bookkeeping failed. A retired fence
        // makes this retry safe even if another cleaner resumes later.
        if (await finishDeletion(context, key, new Date().toISOString()))
          result.deleted.push(key);
        else result.skipped.push({ key, reason: "missing" });
        continue;
      }
      const disposition = await classify(key, object.uploaded, context);
      if (disposition !== "eligible") {
        result.skipped.push({ key, reason: disposition });
        continue;
      }
      const claimedAt = await claimDeletion(context, key, object.uploaded);
      if (!claimedAt) {
        result.skipped.push({ key, reason: "changed" });
        continue;
      }
      await env.R2.delete(key);
      if (!(await finishDeletion(context, key, claimedAt)))
        throw new AppError("CONFLICT");
      result.deleted.push(key);
    } catch {
      result.failed.push({
        key,
        reason: "cleanup_failed; retry confirmed failed keys",
      });
    }
  }
  return result;
}

async function finishDeletion(
  context: Context,
  key: string,
  finishedAt: string,
) {
  const parsed = parseKey(key, context.organizationId)!;
  const [finished] = await db
    .update(objects)
    .set({
      state: "deleted",
      touchedAt: finishedAt,
      lastActorUserId: context.userId,
    })
    .where(
      and(
        eq(objects.key, key),
        eq(objects.organizationId, context.organizationId),
        eq(objects.projectId, parsed.projectId),
        eq(objects.contentHash, parsed.contentHash),
        sql`${objects.state} IN ('deleting','deleted')`,
        unreferencedKey(key),
      ),
    )
    .returning({ key: objects.key });
  if (!finished) return false;
  await db
    .delete(snapshots)
    .where(and(eq(snapshots.r2Key, key), unreferencedSnapshot));
  return true;
}
