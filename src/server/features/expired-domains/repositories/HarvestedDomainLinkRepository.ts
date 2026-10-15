import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { harvestedDomainLinks, harvestedDomains, projects } from "@/db/schema";
import type { LinkMetricRow } from "@/server/features/expired-domains/harvestLinkMetrics";
import { LINK_METRIC_ROWS_PER_QUERY } from "@/shared/workerQueryBudget";

/**
 * Storage for harvested domains' link metrics. A row here means "checked":
 * the pending set is simply harvested rows with no row in this table.
 */

/** Projects with recent harvested domains that have never been checked. */
async function listProjectsNeedingMetrics(
  droppedOnOrAfter: string,
): Promise<Array<{ projectId: string; organizationId: string }>> {
  return db
    .selectDistinct({
      projectId: harvestedDomains.projectId,
      organizationId: projects.organizationId,
    })
    .from(harvestedDomains)
    .innerJoin(projects, eq(projects.id, harvestedDomains.projectId))
    .leftJoin(
      harvestedDomainLinks,
      eq(harvestedDomainLinks.harvestedDomainId, harvestedDomains.id),
    )
    .where(
      and(
        gte(harvestedDomains.droppedOn, droppedOnOrAfter),
        isNull(harvestedDomainLinks.harvestedDomainId),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(harvestedDomains.projectId);
}

/**
 * One project's unchecked recent domains, in the order the panel lists them
 * (graded first, highest DR first, newest first), so the rows a person can see
 * are the ones that get metrics first.
 */
async function listPendingForProject(
  projectId: string,
  droppedOnOrAfter: string,
  limit: number,
): Promise<Array<{ id: string; domain: string }>> {
  return db
    .select({ id: harvestedDomains.id, domain: harvestedDomains.domain })
    .from(harvestedDomains)
    .leftJoin(
      harvestedDomainLinks,
      eq(harvestedDomainLinks.harvestedDomainId, harvestedDomains.id),
    )
    .where(
      and(
        eq(harvestedDomains.projectId, projectId),
        gte(harvestedDomains.droppedOn, droppedOnOrAfter),
        isNull(harvestedDomainLinks.harvestedDomainId),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${harvestedDomains.domainRating} IS NULL THEN 1 ELSE 0 END`,
      desc(harvestedDomains.domainRating),
      desc(harvestedDomains.createdAt),
    )
    .limit(limit);
}

/**
 * Store a checked batch. `onConflictDoNothing` makes a retried or overlapping
 * tick harmless: the first answer for a domain stands.
 */
async function insertMetrics(rows: LinkMetricRow[]): Promise<void> {
  for (
    let index = 0;
    index < rows.length;
    index += LINK_METRIC_ROWS_PER_QUERY
  ) {
    await db
      .insert(harvestedDomainLinks)
      .values(rows.slice(index, index + LINK_METRIC_ROWS_PER_QUERY))
      .onConflictDoNothing();
  }
}

export const HarvestedDomainLinkRepository = {
  listProjectsNeedingMetrics,
  listPendingForProject,
  insertMetrics,
} as const;
