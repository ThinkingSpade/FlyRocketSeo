import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { harvestedDomains } from "@/db/schema";

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
  // D1 has a bound-parameter ceiling per statement; chunk well under it.
  const CHUNK = 50;
  for (let index = 0; index < rows.length; index += CHUNK) {
    await db
      .insert(harvestedDomains)
      .values(rows.slice(index, index + CHUNK))
      .onConflictDoNothing();
  }
}

/** Rows still awaiting a DR grade, oldest first so nothing starves. */
async function listUngraded(
  projectId: string,
  limit: number,
): Promise<HarvestedDomainRow[]> {
  return db
    .select()
    .from(harvestedDomains)
    .where(
      and(
        eq(harvestedDomains.projectId, projectId),
        isNull(harvestedDomains.domainRating),
      ),
    )
    .orderBy(harvestedDomains.createdAt)
    .limit(limit);
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

/** Which dates this project has already harvested, so a day is pulled once. */
async function listHarvestedDates(projectId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ droppedOn: harvestedDomains.droppedOn })
    .from(harvestedDomains)
    .where(eq(harvestedDomains.projectId, projectId));
  return rows.map((row) => row.droppedOn);
}

export const HarvestedDomainRepository = {
  insertMatches,
  listUngraded,
  setDomainRating,
  setAvailability,
  listForProject,
  listHarvestedDates,
} as const;
