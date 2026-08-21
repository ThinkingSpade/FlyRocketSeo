import { env } from "cloudflare:workers";
import { HarvestedDomainRepository } from "@/server/features/expired-domains/repositories/HarvestedDomainRepository";
import { ProjectCompetitorRepository } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";
import { ProjectProfileRepository } from "@/server/features/profiles/repositories/ProjectProfileRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  resolveDomainRating,
  type RatingCache,
} from "@/server/lib/ahrefsDomainRating";
import { fetchDroppedDomains } from "@/server/lib/whoisfreaks";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  datesToHarvest,
  harvestDroppedDomains,
} from "@/server/features/expired-domains/domainHarvest";
import { deriveSeedTerms } from "@/shared/domainNameCandidates";

/**
 * Cron body for the deleted-domain harvest.
 *
 * Called from the same 15-minute `scheduled` handler as the rank checks, and
 * self-limiting rather than schedule-driven: `datesToHarvest` returns nothing
 * once a day is already stored, so the frequent cron does real work about once
 * a day and is otherwise a couple of cheap reads.
 *
 * That matters because a day's file is ~2 MB and ~240,000 rows -- re-pulling
 * one on every 15-minute tick would be pure waste, and the unique index would
 * reject every row anyway.
 *
 * Grading runs in small slices per tick so a backlog drains gradually instead
 * of hammering Ahrefs' free endpoint in one burst.
 */

/** Rows graded per tick. Small on purpose -- the endpoint is free and public. */
const GRADE_BATCH = 15;
/** How far back a first run reaches. */
const BACKFILL_DAYS = 7;
const TLDS = ["com"];

export async function runScheduledDomainHarvest(): Promise<void> {
  // No key means the subscription is over (or never started). That is an
  // expected end state, not an error: the harvested rows stay readable and
  // nothing else in the app depends on the feed being live.
  if (!(await getOptionalEnvValue("WHOISFREAKS_API_KEY"))) return;

  const cache: RatingCache = {
    get: (key) => env.KV.get(key),
    put: (key, value, options) => env.KV.put(key, value, options),
  };

  for (const project of await listHarvestProjects()) {
    try {
      await harvestForProject(project);
      await gradeForProject(project.id, cache);
    } catch (error) {
      // One project's failure must not stop the others.
      console.error(`expired-domains.harvest failed for ${project.id}:`, error);
    }
  }
}

type HarvestProject = { id: string; domain: string };

/**
 * Projects worth harvesting for: those with a domain set.
 *
 * Deliberately narrow. A project with no domain has no vocabulary to match
 * against, so pulling a 2 MB file for it would be a guaranteed zero.
 */
async function listHarvestProjects(): Promise<HarvestProject[]> {
  const { db } = await import("@/db");
  const { projects } = await import("@/db/schema");
  const { and, isNotNull, isNull } = await import("drizzle-orm");

  const rows = await db
    .select({ id: projects.id, domain: projects.domain })
    .from(projects)
    .where(and(isNotNull(projects.domain), isNull(projects.archivedAt)));

  return rows
    .filter((row): row is HarvestProject => Boolean(row.domain))
    .map((row) => ({ id: row.id, domain: row.domain }));
}

async function harvestForProject(project: HarvestProject): Promise<void> {
  const [keywordRows, profile, competitorRows, already] = await Promise.all([
    collectTrackedKeywords(project.id),
    ProjectProfileRepository.getByProject(project.id),
    ProjectCompetitorRepository.listByProject(project.id),
    HarvestedDomainRepository.listHarvestedDates(project.id),
  ]);

  const terms = deriveSeedTerms(keywordRows, profile?.offer ?? "");
  if (terms.length === 0) return;

  const dates = datesToHarvest({
    today: new Date().toISOString().slice(0, 10),
    already,
    maxDays: BACKFILL_DAYS,
  });
  if (dates.length === 0) return;

  await harvestDroppedDomains({
    projectId: project.id,
    terms,
    exclude: [
      project.domain.toLowerCase(),
      ...competitorRows.map((row) => row.domain.toLowerCase()),
    ],
    // Only ONE date per tick: a day's download is large, and the next tick is
    // fifteen minutes away, so a backfill drains steadily without ever holding
    // several files in memory at once.
    dates: dates.slice(0, 1),
    fetchDropped: (date) => fetchDroppedDomains({ date, tlds: TLDS }),
    insertMatches: (rows) => HarvestedDomainRepository.insertMatches(rows),
  });
}

/** Grade a slice of ungraded rows. Free, but rate-limited by politeness. */
async function gradeForProject(
  projectId: string,
  cache: RatingCache,
): Promise<void> {
  const ungraded = await HarvestedDomainRepository.listUngraded(
    projectId,
    GRADE_BATCH,
  );

  for (const row of ungraded) {
    try {
      const rating = await resolveDomainRating(row.domain, cache);
      // A real 0 is stored as 0. Only a thrown lookup leaves it null, so the
      // row is retried on a later tick rather than being marked "no authority".
      if (rating !== null) {
        await HarvestedDomainRepository.setDomainRating(row.id, rating);
      }
    } catch {
      // Leave it ungraded; the next tick picks it up again.
    }
  }
}

async function collectTrackedKeywords(projectId: string): Promise<string[]> {
  try {
    const configs =
      await RankTrackingRepository.getConfigsForProject(projectId);
    const perConfig = await Promise.all(
      configs.map((config) =>
        RankTrackingRepository.getKeywordsForConfig(config.id),
      ),
    );
    return [
      ...new Set(
        perConfig
          .flat()
          .map((row) => row.keyword.trim())
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}
