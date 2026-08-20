import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectSubdomains } from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";
import type { SubdomainSource } from "@/shared/project-subdomains";

export type ProjectSubdomainRow = {
  id: string;
  projectId: string;
  host: string;
  source: SubdomainSource;
  isActive: boolean;
  organicKeywords: number | null;
  organicTraffic: number | null;
  clicks: number | null;
  impressions: number | null;
  lastSeenAt: string | null;
  createdAt: string;
};

/**
 * Ordered so the hosts worth acting on surface first in a large estate:
 * strongest organic signal, then strongest Search Console signal, then host
 * name as a stable tiebreaker. `host` is the final key so the order is total --
 * without it, rows with identical (null) metrics would come back in whatever
 * order the engine chose and shuffle between reads.
 */
async function listForProject(projectId: string) {
  return db
    .select()
    .from(projectSubdomains)
    .where(eq(projectSubdomains.projectId, projectId))
    .orderBy(
      desc(projectSubdomains.organicTraffic),
      desc(projectSubdomains.clicks),
      asc(projectSubdomains.host),
    );
}

async function countForProject(projectId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(projectSubdomains)
    .where(eq(projectSubdomains.projectId, projectId));
  return row?.value ?? 0;
}

async function getByHost(projectId: string, host: string) {
  const [row] = await db
    .select()
    .from(projectSubdomains)
    .where(
      and(
        eq(projectSubdomains.projectId, projectId),
        eq(projectSubdomains.host, host),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function insert(input: {
  projectId: string;
  host: string;
  source: SubdomainSource;
  organicKeywords?: number | null;
  organicTraffic?: number | null;
  clicks?: number | null;
  impressions?: number | null;
  lastSeenAt?: string | null;
}) {
  const [row] = await db
    .insert(projectSubdomains)
    .values({ id: crypto.randomUUID(), ...input })
    .returning();
  return row;
}

export type DiscoveryMetrics = {
  organicKeywords: number | null;
  organicTraffic: number | null;
  clicks: number | null;
  impressions: number | null;
};

/**
 * The metric columns to write for one row, dropping the ones this run could not
 * measure.
 *
 * Only ever widens what is known: a metric the run had no value for is left
 * alone rather than written as null, so a Search Console pass does not erase the
 * organic numbers an earlier DataForSEO pass recorded (and vice versa).
 */
function buildMetricUpdates(metrics: DiscoveryMetrics, lastSeenAt: string) {
  return {
    lastSeenAt,
    ...(metrics.organicKeywords !== null
      ? { organicKeywords: metrics.organicKeywords }
      : {}),
    ...(metrics.organicTraffic !== null
      ? { organicTraffic: metrics.organicTraffic }
      : {}),
    ...(metrics.clicks !== null ? { clicks: metrics.clicks } : {}),
    ...(metrics.impressions !== null
      ? { impressions: metrics.impressions }
      : {}),
  };
}

/**
 * Bulk-insert newly discovered hosts.
 *
 * Batched rather than awaited one at a time: a first run on a large estate
 * inserts hundreds of rows, and a round trip each would dominate the request.
 */
async function insertMany(
  projectId: string,
  rows: Array<{
    host: string;
    source: SubdomainSource;
    metrics: DiscoveryMetrics;
    lastSeenAt: string;
  }>,
) {
  await executeInBatches(rows, (tx, row) =>
    tx.insert(projectSubdomains).values({
      id: crypto.randomUUID(),
      projectId,
      host: row.host,
      source: row.source,
      ...buildMetricUpdates(row.metrics, row.lastSeenAt),
    }),
  );
}

/**
 * Refresh the discovery metrics of rows a re-run saw again.
 *
 * `source` and `isActive` are intentionally NOT touched. A host the user added
 * by hand keeps its `manual` provenance even once a run confirms it, and a host
 * the user switched off stays off -- re-enabling it here would make exclusions
 * silently temporary, so a re-run could never be trusted.
 */
async function refreshMetricsMany(
  projectId: string,
  updates: Array<{ id: string; metrics: DiscoveryMetrics; lastSeenAt: string }>,
) {
  await executeInBatches(updates, (tx, update) =>
    tx
      .update(projectSubdomains)
      .set(buildMetricUpdates(update.metrics, update.lastSeenAt))
      .where(
        and(
          eq(projectSubdomains.projectId, projectId),
          eq(projectSubdomains.id, update.id),
        ),
      ),
  );
}

/**
 * Project-scoped by design: the id list arrives from the client, so matching on
 * `projectId` as well is what stops a caller from deleting another project's
 * rows by guessing ids.
 *
 * One statement per id rather than a single `inArray`. D1 caps bound parameters
 * at ~100 per statement, which a bulk selection plus the project id would blow
 * straight through; `executeInBatches` groups them into atomic chunks that stay
 * under the limit.
 */
async function removeMany(projectId: string, ids: string[]) {
  await executeInBatches(ids, (tx, id) =>
    tx
      .delete(projectSubdomains)
      .where(
        and(
          eq(projectSubdomains.projectId, projectId),
          eq(projectSubdomains.id, id),
        ),
      ),
  );
}

async function setActiveMany(
  projectId: string,
  ids: string[],
  isActive: boolean,
) {
  await executeInBatches(ids, (tx, id) =>
    tx
      .update(projectSubdomains)
      .set({ isActive })
      .where(
        and(
          eq(projectSubdomains.projectId, projectId),
          eq(projectSubdomains.id, id),
        ),
      ),
  );
}

export const ProjectSubdomainRepository = {
  listForProject,
  countForProject,
  getByHost,
  insert,
  insertMany,
  refreshMetricsMany,
  removeMany,
  setActiveMany,
};
