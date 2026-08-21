import { and, desc, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { harvestedDomains, harvestRuns } from "@/db/schema";
import { partitionHarvestRunDates } from "@/server/features/expired-domains/harvestRunDates";
import { HARVEST_INSERT_ROWS_PER_QUERY } from "@/shared/workerQueryBudget";

type HarvestedDomainRow = typeof harvestedDomains.$inferSelect;

/**
 * Storage for the daily deleted-domain harvest.
 *
 * Rows outlive the feed subscription on purpose: the subscription is a tap
 * that gets turned off, and the shortlist is the asset.
 */

/**
 * Insert a day's matches, ignoring any already stored for this project.
 *
 * `onConflictDoNothing` against the (project, domain) unique index is what
 * makes re-running a date safe -- a retried or overlapping day must not
 * duplicate rows or reset a DR grade that has already been paid for in time.
 */
async function insertMatches(
  rows: Array<{
    id: string;
    projectId: string;
    domain: string;
    matchedTerm: string;
    droppedOn: string;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  // D1 allows at most 100 BOUND PARAMETERS per statement. These five supplied
  // values plus Drizzle's bound domain_rating_attempts default make six per
  // row, so 15 rows use 90. At 50, the first insert with 21+ matches failed
  // outright and the day saved nothing.
  for (
    let index = 0;
    index < rows.length;
    index += HARVEST_INSERT_ROWS_PER_QUERY
  ) {
    await db
      .insert(harvestedDomains)
      .values(rows.slice(index, index + HARVEST_INSERT_ROWS_PER_QUERY))
      .onConflictDoNothing();
  }
}

/**
 * Record a DR grade. `rating` may be 0 -- a real zero is a decisive signal and
 * must be stored as 0, never collapsed to null, which means "not yet graded".
 */
async function setDomainRating(
  id: string,
  rating: number | null,
): Promise<void> {
  await db
    .update(harvestedDomains)
    .set({ domainRating: rating })
    .where(eq(harvestedDomains.id, id));
}

async function setAvailability(
  id: string,
  isAvailable: boolean | null,
  checkedAtIso: string,
): Promise<void> {
  await db
    .update(harvestedDomains)
    .set({ isAvailable, availabilityCheckedAt: checkedAtIso })
    .where(eq(harvestedDomains.id, id));
}

/** The shortlist: best-graded first, ungraded last. */
async function listForProject(
  projectId: string,
  limit: number,
): Promise<HarvestedDomainRow[]> {
  return db
    .select()
    .from(harvestedDomains)
    .where(eq(harvestedDomains.projectId, projectId))
    .orderBy(
      // NULLS LAST without relying on dialect-specific syntax: graded rows
      // sort ahead of ungraded ones, then by rating descending.
      sql`CASE WHEN ${harvestedDomains.domainRating} IS NULL THEN 1 ELSE 0 END`,
      desc(harvestedDomains.domainRating),
      desc(harvestedDomains.createdAt),
    )
    .limit(limit);
}

/**
 * Which dates this project has already processed.
 *
 * Read from `harvest_runs`, NOT from matched rows. A day that legitimately
 * yields zero matches leaves no `harvested_domains` row, and inferring
 * completion from matches made the scheduler re-download that day's 2 MB file
 * on every 15-minute tick for as long as it stayed newest.
 */
async function listHarvestRunDates(
  projectId: string,
): Promise<{ harvestedDates: string[]; skippedDates: string[] }> {
  const rows = await db
    .select({
      droppedOn: harvestRuns.droppedOn,
      skipReason: harvestRuns.skipReason,
    })
    .from(harvestRuns)
    .where(
      and(
        eq(harvestRuns.projectId, projectId),
        // A non-null lease is an in-flight/crashed claim, not completion.
        isNull(harvestRuns.leaseExpiresAt),
      ),
    );
  return partitionHarvestRunDates(rows);
}

/**
 * Atomically claim a project/date. The unique index is the mutex; an upsert may
 * replace only an expired non-null lease. Completed rows have a null lease, so
 * even a caller with a stale `already` read cannot reclaim them.
 */
async function claimRun(input: {
  projectId: string;
  droppedOn: string;
  claimedAtIso: string;
  leaseExpiresAtIso: string;
}): Promise<string | null> {
  const claimId = crypto.randomUUID();
  const [claimed] = await db
    .insert(harvestRuns)
    .values({
      id: claimId,
      projectId: input.projectId,
      droppedOn: input.droppedOn,
      leaseExpiresAt: input.leaseExpiresAtIso,
    })
    .onConflictDoUpdate({
      target: [harvestRuns.projectId, harvestRuns.droppedOn],
      set: {
        // Replacing the token fences the expired owner: its later complete or
        // release is constrained by the old id and cannot touch this claim.
        id: claimId,
        leaseExpiresAt: input.leaseExpiresAtIso,
      },
      setWhere: lte(harvestRuns.leaseExpiresAt, input.claimedAtIso),
    })
    .returning({ id: harvestRuns.id });

  return claimed?.id === claimId ? claimId : null;
}

/** Verify the fencing token immediately before its harvested rows are stored. */
async function ownsRun(input: {
  claimId: string;
  checkedAtIso: string;
}): Promise<boolean> {
  const [owned] = await db
    .select({ id: harvestRuns.id })
    .from(harvestRuns)
    .where(
      and(
        eq(harvestRuns.id, input.claimId),
        gt(harvestRuns.leaseExpiresAt, input.checkedAtIso),
      ),
    )
    .limit(1);
  return Boolean(owned);
}

/** Mark a claim complete only after every insert chunk succeeded. */
async function completeRun(input: {
  claimId: string;
  matched: number;
  completedAtIso: string;
}): Promise<boolean> {
  const [completed] = await db
    .update(harvestRuns)
    .set({
      matched: input.matched,
      skipReason: null,
      leaseExpiresAt: null,
      completedAt: input.completedAtIso,
    })
    .where(
      and(
        eq(harvestRuns.id, input.claimId),
        isNotNull(harvestRuns.leaseExpiresAt),
      ),
    )
    .returning({ id: harvestRuns.id });
  return Boolean(completed);
}

/** Permanently skip a proven subscription-window miss under the same fence. */
async function skipRun(input: {
  claimId: string;
  reason: string;
  completedAtIso: string;
}): Promise<boolean> {
  const [skipped] = await db
    .update(harvestRuns)
    .set({
      matched: 0,
      skipReason: input.reason,
      leaseExpiresAt: null,
      completedAt: input.completedAtIso,
    })
    .where(
      and(
        eq(harvestRuns.id, input.claimId),
        isNotNull(harvestRuns.leaseExpiresAt),
      ),
    )
    .returning({ id: harvestRuns.id });
  return Boolean(skipped);
}

/** Release a known failure; a crash instead becomes retryable on lease expiry. */
async function releaseRun(claimId: string): Promise<void> {
  await db
    .delete(harvestRuns)
    .where(
      and(eq(harvestRuns.id, claimId), isNotNull(harvestRuns.leaseExpiresAt)),
    );
}

export const HarvestedDomainRepository = {
  insertMatches,
  setDomainRating,
  setAvailability,
  listForProject,
  listHarvestRunDates,
  claimRun,
  ownsRun,
  completeRun,
  skipRun,
  releaseRun,
} as const;
