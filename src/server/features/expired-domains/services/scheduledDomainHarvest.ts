import { env } from "cloudflare:workers";
import { HarvestedDomainRepository } from "@/server/features/expired-domains/repositories/HarvestedDomainRepository";
import { ProjectCompetitorRepository } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";
import { ProjectProfileRepository } from "@/server/features/profiles/repositories/ProjectProfileRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import {
  resolveDomainRating,
  type RatingCache,
} from "@/server/lib/ahrefsDomainRating";
import { streamDroppedDomains } from "@/server/lib/whoisfreaks";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  datesToHarvest,
  harvestDroppedDomains,
} from "@/server/features/expired-domains/domainHarvest";
import { resolveHarvestVocabulary } from "@/server/features/expired-domains/harvestVocabulary";

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
  // The feed key gates HARVESTING only. Ahrefs DR is free and keyless, so
  // grading must keep running after the subscription ends -- otherwise every
  // row harvested in the final days stays ungraded forever.
  const canHarvest = Boolean(await getOptionalEnvValue("WHOISFREAKS_API_KEY"));

  const cache: RatingCache = {
    get: (key) => env.KV.get(key),
    put: (key, value, options) => env.KV.put(key, value, options),
  };
  const projects = await listHarvestProjects();

  if (canHarvest) {
    const publishedDate = newestPublishedDate(new Date());
    const jobs: PreparedHarvest[] = [];
    for (const project of projects) {
      try {
        const job = await prepareHarvestForProject(project, publishedDate);
        if (job) jobs.push(job);
      } catch (error) {
        // One project's preparation failure must not stop the shared feed.
        console.error(
          `expired-domains.harvest preparation failed for ${project.id}:`,
          error,
        );
      }
    }

    try {
      await harvestDroppedDomains({
        projects: jobs,
        now: () => new Date(),
        streamDropped: (date, onDomain) =>
          streamDroppedDomains({ date, tlds: TLDS, onDomain }),
        insertMatches: (rows) => HarvestedDomainRepository.insertMatches(rows),
        claimRun: (run) => HarvestedDomainRepository.claimRun(run),
        completeRun: (run) => HarvestedDomainRepository.completeRun(run),
        releaseRun: (claimId) => HarvestedDomainRepository.releaseRun(claimId),
      });
    } catch (error) {
      console.error("expired-domains.shared-harvest failed:", error);
    }
  }

  // Ahrefs DR is free and keyless, so grading continues without the feed key.
  for (const project of projects) {
    try {
      await gradeForProject(project.id, cache);
    } catch (error) {
      console.error(`expired-domains.grading failed for ${project.id}:`, error);
    }
  }
}

type HarvestProject = { id: string; domain: string };
type PreparedHarvest = {
  projectId: string;
  droppedOn: string;
  terms: string[];
  exclude: string[];
};

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

/**
 * The newest feed date that actually exists.
 *
 * A day's file publishes at 03:00 UTC the FOLLOWING day. Before that hour,
 * "yesterday" does not exist yet, and asking for it is a guaranteed failed
 * request on every tick between midnight and 03:00.
 */
function newestPublishedDate(now: Date): string {
  const shifted = new Date(now.getTime());
  if (shifted.getUTCHours() < 3) {
    shifted.setUTCDate(shifted.getUTCDate() - 1);
  }
  return shifted.toISOString().slice(0, 10);
}

const vocabularyCache = {
  get: (key: string) => env.KV.get(key),
  put: (key: string, value: string, options: { expirationTtl: number }) =>
    env.KV.put(key, value, options),
};

async function prepareHarvestForProject(
  project: HarvestProject,
  publishedDate: string,
): Promise<PreparedHarvest | null> {
  const [keywordRows, profile, competitorRows, already] = await Promise.all([
    collectTrackedKeywords(project.id),
    ProjectProfileRepository.getByProject(project.id),
    ProjectCompetitorRepository.listByProject(project.id),
    HarvestedDomainRepository.listHarvestedDates(project.id),
  ]);

  // Check for work BEFORE resolving vocabulary. Vocabulary can cost a model
  // call on a cache miss, and doing it first meant a fully-harvested project
  // paid for one on every 15-minute tick -- 96 a day, with no user action.
  const [droppedOn] = datesToHarvest({
    today: publishedDate,
    already,
    maxDays: BACKFILL_DAYS,
  });
  if (!droppedOn) return null;

  // Seed terms PLUS the industries around this business -- schools, gyms,
  // hotels for a vending operator. Cached, so this is one model call a month.
  const { all: terms } = await resolveHarvestVocabulary({
    projectId: project.id,
    keywords: keywordRows,
    profileText: profile?.offer ?? "",
    cache: vocabularyCache,
  });
  if (terms.length === 0) return null;

  return {
    projectId: project.id,
    droppedOn,
    terms,
    exclude: [
      project.domain.toLowerCase(),
      ...competitorRows.map((row) => row.domain.toLowerCase()),
    ],
  };
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
