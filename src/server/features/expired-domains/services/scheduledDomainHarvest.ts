import { env } from "cloudflare:workers";
import { HarvestedDomainRepository } from "@/server/features/expired-domains/repositories/HarvestedDomainRepository";
import { ProjectCompetitorRepository } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";
import { ProjectProfileRepository } from "@/server/features/profiles/repositories/ProjectProfileRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { type RatingCache } from "@/server/lib/ahrefsDomainRating";
import { streamDroppedDomains } from "@/server/lib/whoisfreaks";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";
import { harvestReadiness } from "@/server/features/expired-domains/harvestReadiness";
import { harvestDroppedDomains } from "@/server/features/expired-domains/domainHarvest";
import { resolveHarvestVocabulary } from "@/server/features/expired-domains/harvestVocabulary";
import { gradeStoredDomainRatings } from "@/server/features/expired-domains/services/gradeStoredDomainRatings";
import {
  runScheduledDomainWork,
  type ScheduledHarvestCandidate,
  type ScheduledHarvestProjectState,
} from "@/server/features/expired-domains/scheduledDomainHarvestPolicy";

/**
 * Cron body for the deleted-domain harvest.
 *
 * Called on its own 15-minute Cron Trigger so rank-check queries cannot consume
 * this invocation's 50-query Free-plan budget.
 *
 * That matters because a day's file is ~2 MB and ~240,000 rows -- re-pulling
 * one on every 15-minute tick would be pure waste, and the unique index would
 * reject every row anyway.
 *
 * Grading runs in small slices per tick so a backlog drains gradually instead
 * of hammering Ahrefs' free endpoint in one burst.
 */

/** How far back a first run reaches. */
const BACKFILL_DAYS = 7;

export async function runScheduledDomainHarvest(
  scheduledAt = new Date(),
): Promise<void> {
  // The feed key gates HARVESTING only. Ahrefs DR is free and keyless, so
  // grading must keep running after the subscription ends -- otherwise every
  // row harvested in the final days stays ungraded forever.
  const canHarvest = Boolean(await getOptionalEnvValue("WHOISFREAKS_API_KEY"));

  const cache: RatingCache = {
    get: (key) => env.KV.get(key),
    put: (key, value, options) => env.KV.put(key, value, options),
  };
  const publishedDate = newestPublishedDate(scheduledAt);

  await runScheduledDomainWork(
    {
      canHarvest,
      publishedDate,
      scheduledAtMs: scheduledAt.getTime(),
    },
    {
      listProjectStates: () =>
        listHarvestProjectStates(publishedDate, scheduledAt.getTime()),
      draftProfile: async (candidate) => {
        // A new project has no vocabulary until its profile exists, so this is
        // what makes "add a domain" enough for the harvest to start. One crawl
        // and one model call per project; a failed draft retries once a day.
        try {
          const { ProfileAutoDraftService } =
            await import("@/server/features/profiles/services/ProfileAutoDraftService");
          const result = await ProfileAutoDraftService.run({
            projectId: candidate.projectId,
            domain: candidate.domain,
          });
          console.log(
            `[cron] profile-draft ${candidate.projectId} status=${result.status}` +
              (result.status === "drafted"
                ? ` offerChars=${result.profile.offer.length}`
                : ""),
          );
        } catch (error) {
          // The code is logged on its own because it is what tells a site
          // that refused the Worker apart from a model failure.
          console.error(
            `expired-domains.profile-draft failed for ${candidate.projectId}` +
              ` code=${error instanceof AppError ? error.code : "UNKNOWN"}:`,
            error,
          );
        }
      },
      harvestProject: async (candidate) => {
        // A completed-but-empty result (claimed nothing, matched nothing) is
        // not an exception, so it needs its own log line -- otherwise a tick
        // that silently accomplishes nothing is indistinguishable from one
        // that never ran at all, which is exactly the failure mode this whole
        // fix was for.
        try {
          const job = await prepareHarvestForProject(candidate);
          const result = await harvestDroppedDomains({
            projects: [job],
            now: () => new Date(),
            streamDropped: (date, onDomain) =>
              streamDroppedDomains({ date, onDomain }),
            insertMatches: (rows) =>
              HarvestedDomainRepository.insertMatches(rows),
            claimRun: (run) => HarvestedDomainRepository.claimRun(run),
            ownsRun: (run) => HarvestedDomainRepository.ownsRun(run),
            completeRun: (run) => HarvestedDomainRepository.completeRun(run),
            skipRun: (run) => HarvestedDomainRepository.skipRun(run),
            releaseRun: (claimId) =>
              HarvestedDomainRepository.releaseRun(claimId),
          });
          console.log(
            `[cron] harvest ${candidate.projectId}/${candidate.droppedOn}` +
              ` matched=${result.matched}` +
              ` harvested=${result.harvestedRuns.length}` +
              ` skipped=${result.skippedRuns.length}` +
              ` failed=${result.failedRuns.length}`,
          );
        } catch (error) {
          // A failed harvest attempt still consumes this tick's one work unit.
          console.error(
            `expired-domains.harvest failed for ${candidate.projectId}:`,
            error,
          );
        }
      },
      grade: async () => {
        try {
          const result = await gradeStoredDomainRatings(null, cache);
          console.log(
            `[cron] grade attempted=${result.attempted}` +
              ` graded=${result.graded}` +
              ` failed=${result.failed}` +
              ` remaining=${result.remaining}`,
          );
        } catch (error) {
          console.error("expired-domains.grading batch failed:", error);
        }
      },
    },
  );
}

type PreparedHarvest = {
  projectId: string;
  droppedOn: string;
  terms: () => Promise<string[]>;
  exclude: string[];
};

/**
 * Projects worth considering: those with a domain set, plus whether each has
 * the vocabulary a harvest needs.
 *
 * A project with no domain has no site to draft from and nothing to match, so
 * it is left out entirely. A project WITH a domain but no vocabulary is kept,
 * because the policy drafts its profile -- but it is never a harvest
 * candidate, which is what used to starve grading.
 *
 * Two fleet reads: projects joined to their completed runs and profile, then
 * every active tracked keyword in one query rather than one per project.
 */
async function listHarvestProjectStates(
  publishedDate: string,
  nowMs: number,
): Promise<ScheduledHarvestProjectState[]> {
  const { db } = await import("@/db");
  const {
    harvestRuns,
    projectProfiles,
    projects,
    rankTrackingConfigs,
    rankTrackingKeywords,
  } = await import("@/db/schema");
  const { and, eq, gte, isNotNull, isNull } = await import("drizzle-orm");
  const oldestRelevantDate = new Date(
    Date.parse(`${publishedDate}T00:00:00.000Z`) - BACKFILL_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  const rows = await db
    .select({
      id: projects.id,
      domain: projects.domain,
      completedDate: harvestRuns.droppedOn,
      profileId: projectProfiles.id,
      offer: projectProfiles.offer,
      customer: projectProfiles.customer,
      exclusions: projectProfiles.exclusions,
      brandTerms: projectProfiles.brandTerms,
      source: projectProfiles.source,
      confirmedAt: projectProfiles.confirmedAt,
      draftedAt: projectProfiles.draftedAt,
    })
    .from(projects)
    .leftJoin(
      harvestRuns,
      and(
        eq(harvestRuns.projectId, projects.id),
        gte(harvestRuns.droppedOn, oldestRelevantDate),
        isNull(harvestRuns.leaseExpiresAt),
      ),
    )
    .leftJoin(projectProfiles, eq(projectProfiles.projectId, projects.id))
    .where(and(isNotNull(projects.domain), isNull(projects.archivedAt)));

  const keywordRows = await db
    .select({
      projectId: rankTrackingConfigs.projectId,
      keyword: rankTrackingKeywords.keyword,
    })
    .from(rankTrackingKeywords)
    .innerJoin(
      rankTrackingConfigs,
      eq(rankTrackingKeywords.configId, rankTrackingConfigs.id),
    )
    .where(eq(rankTrackingConfigs.isActive, true));
  const keywordsByProject = new Map<string, string[]>();
  for (const row of keywordRows) {
    const list = keywordsByProject.get(row.projectId) ?? [];
    list.push(row.keyword);
    keywordsByProject.set(row.projectId, list);
  }

  const states = new Map<string, ScheduledHarvestProjectState>();
  for (const row of rows) {
    if (!row.domain) continue;
    const state = states.get(row.id) ?? {
      id: row.id,
      domain: row.domain,
      completedDates: [],
      readiness: harvestReadiness({
        keywords: keywordsByProject.get(row.id) ?? [],
        profile:
          row.profileId && row.source
            ? {
                offer: row.offer ?? "",
                customer: row.customer ?? "",
                exclusions: row.exclusions ?? "",
                brandTerms: row.brandTerms ?? "",
                source: row.source,
                confirmedAt: row.confirmedAt ?? null,
                draftedAt: row.draftedAt ?? null,
              }
            : null,
        nowMs,
      }).kind,
    };
    if (row.completedDate) state.completedDates.push(row.completedDate);
    states.set(row.id, state);
  }
  return [...states.values()];
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
  project: ScheduledHarvestCandidate,
): Promise<PreparedHarvest> {
  const [keywordRows, profile, competitorRows] = await Promise.all([
    collectTrackedKeywords(project.projectId),
    ProjectProfileRepository.getByProject(project.projectId),
    ProjectCompetitorRepository.listByProject(project.projectId),
  ]);

  return {
    projectId: project.projectId,
    droppedOn: project.droppedOn,
    // Seed terms plus adjacent industries already cached by an explicit user
    // action. A cron cache miss stays on the free seed vocabulary.
    terms: async () => {
      const { all } = await resolveHarvestVocabulary({
        projectId: project.projectId,
        keywords: keywordRows,
        profileText: profile?.offer ?? "",
        cache: vocabularyCache,
        // The cron may read a vocabulary warmed by a user click, but it must
        // never initiate paid OpenRouter work on its own.
        allowModelDerivation: false,
      });
      return all;
    },
    exclude: [
      project.domain.toLowerCase(),
      ...competitorRows.map((row) => row.domain.toLowerCase()),
    ],
  };
}

async function collectTrackedKeywords(projectId: string): Promise<string[]> {
  try {
    const rows = await RankTrackingRepository.getKeywordsForProject(projectId);
    return [...new Set(rows.map((row) => row.keyword.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}
