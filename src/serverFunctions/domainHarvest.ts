import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { ProjectCompetitorRepository } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";
import {
  datesToHarvest,
  harvestDroppedDomains,
} from "@/server/features/expired-domains/domainHarvest";
import { HarvestedDomainRepository } from "@/server/features/expired-domains/repositories/HarvestedDomainRepository";
import { ProjectProfileRepository } from "@/server/features/profiles/repositories/ProjectProfileRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { resolveDomainAvailability } from "@/server/lib/apiverve/domainAvailability";
import type { ExpirationCache } from "@/server/lib/apiverve/domainExpiration";
import { AppError } from "@/server/lib/errors";
import { streamDroppedDomains } from "@/server/lib/whoisfreaks";
import { resolveHarvestVocabulary } from "@/server/features/expired-domains/harvestVocabulary";
import { refreshHarvestedAvailability } from "@/server/features/expired-domains/harvestAvailability";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { MAX_HARVEST_AVAILABILITY_BATCH } from "@/shared/harvestAvailability";

/**
 * Reading and running the deleted-domain harvest.
 *
 * Unlike everything else in this feature, harvesting is NOT metered. The feed
 * is a flat subscription and Ahrefs DR is free and keyless, so pulling a day
 * and grading it costs nothing marginal -- there is no spend gate on those, and
 * putting one there would only train the user to ignore gates that do matter.
 *
 * Availability is the exception: it bills APIVerve per domain, so it stays
 * behind an explicit action with a stated cost.
 */
const projectInput = z.object({ projectId: z.string().min(1) });

const MAX_ROWS = 200;

/** The stored shortlist. Free: pure D1 read, no feed call. */
export const getHarvestedDomains = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput)
  .handler(async ({ context }) => {
    const rows = await HarvestedDomainRepository.listForProject(
      context.projectId,
      MAX_ROWS,
    );
    const dates = await HarvestedDomainRepository.listHarvestedDates(
      context.projectId,
    );
    return {
      rows: rows.map((row) => ({
        domain: row.domain,
        matchedTerm: row.matchedTerm,
        droppedOn: row.droppedOn,
        // null means NOT YET GRADED, never "no authority". A real 0 is a 0.
        domainRating: row.domainRating,
        isAvailable: row.isAvailable,
        availabilityCheckedAt: row.availabilityCheckedAt,
      })),
      harvestedDates: dates.toSorted().toReversed(),
    };
  });

/**
 * Pull the next unharvested day immediately, rather than waiting for the cron.
 *
 * Free, but deliberately one day per call: a day's file is ~2 MB and ~240,000
 * rows, and a Worker request should not sit on several at once.
 */
export const runHarvestNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput)
  .handler(async ({ context }) => {
    const projectDomain = context.project.domain;
    if (!projectDomain) {
      throw new AppError(
        "PROJECT_DOMAIN_MISSING",
        "Set this project's domain before harvesting",
      );
    }

    const [profile, competitors, already, keywords] = await Promise.all([
      ProjectProfileRepository.getByProject(context.projectId),
      ProjectCompetitorRepository.listByProject(context.projectId),
      HarvestedDomainRepository.listHarvestedDates(context.projectId),
      collectTrackedKeywords(context.projectId),
    ]);

    const { all: terms } = await resolveHarvestVocabulary({
      projectId: context.projectId,
      keywords,
      profileText: profile?.offer ?? "",
      cache: {
        get: (key) => env.KV.get(key),
        put: (key, value, options) => env.KV.put(key, value, options),
      },
    });
    if (terms.length === 0) {
      return { matched: 0, harvestedDates: [], failedDates: [], terms };
    }

    const dates = datesToHarvest({
      today: new Date().toISOString().slice(0, 10),
      already,
      maxDays: 7,
    });

    const [droppedOn] = dates;
    if (!droppedOn) {
      return { matched: 0, harvestedDates: [], failedDates: [], terms };
    }

    const result = await harvestDroppedDomains({
      projects: [
        {
          projectId: context.projectId,
          droppedOn,
          terms,
          exclude: [
            projectDomain.toLowerCase(),
            ...competitors.map((row) => row.domain.toLowerCase()),
          ],
        },
      ],
      now: () => new Date(),
      streamDropped: (date, onDomain) =>
        streamDroppedDomains({ date, tlds: ["com"], onDomain }),
      insertMatches: (rows) => HarvestedDomainRepository.insertMatches(rows),
      claimRun: (run) => HarvestedDomainRepository.claimRun(run),
      completeRun: (run) => HarvestedDomainRepository.completeRun(run),
      releaseRun: (claimId) => HarvestedDomainRepository.releaseRun(claimId),
    });

    return {
      matched: result.matched,
      harvestedDates: result.harvestedRuns.map((run) => run.droppedOn),
      failedDates: result.failedRuns.map((run) => run.droppedOn),
      terms,
    };
  });

const availabilityInput = z.object({
  projectId: z.string().min(1),
  domains: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_HARVEST_AVAILABILITY_BATCH),
});

/**
 * Check whether harvested domains are still registerable. METERED -- 5 APIVerve
 * credits each, so the caller must gate this behind an explicit action.
 *
 * Worth re-running over time: a domain free on the day it dropped is often gone
 * a fortnight later, and a stale "available" is the one error that wastes the
 * user's time rather than their credits.
 */
export const checkHarvestedAvailability = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(availabilityInput)
  .handler(async ({ data, context }) => {
    const cache: ExpirationCache = {
      get: (key) => env.KV.get(key),
      put: (key, value, options) => env.KV.put(key, value, options),
    };

    return refreshHarvestedAvailability(
      { projectId: context.projectId, domains: data.domains },
      {
        listForProject: (projectId) =>
          HarvestedDomainRepository.listForProject(projectId, MAX_ROWS),
        resolveAvailability: (domain) =>
          resolveDomainAvailability(domain, cache),
        setAvailability: (id, isAvailable, checkedAtIso) =>
          HarvestedDomainRepository.setAvailability(
            id,
            isAvailable,
            checkedAtIso,
          ),
        now: () => new Date(),
      },
    );
  });

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
