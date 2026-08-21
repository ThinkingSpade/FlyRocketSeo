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
import { fetchDroppedDomains } from "@/server/lib/whoisfreaks";
import { resolveHarvestVocabulary } from "@/server/features/expired-domains/harvestVocabulary";
import { requireProjectContext } from "@/serverFunctions/middleware";

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

    const result = await harvestDroppedDomains({
      projectId: context.projectId,
      terms,
      exclude: [
        projectDomain.toLowerCase(),
        ...competitors.map((row) => row.domain.toLowerCase()),
      ],
      dates: dates.slice(0, 1),
      fetchDropped: (date) => fetchDroppedDomains({ date, tlds: ["com"] }),
      insertMatches: (rows) => HarvestedDomainRepository.insertMatches(rows),
    });

    return { ...result, terms };
  });

const availabilityInput = z.object({
  projectId: z.string().min(1),
  domains: z.array(z.string().trim().min(1)).min(1).max(25),
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

    const stored = await HarvestedDomainRepository.listForProject(
      context.projectId,
      MAX_ROWS,
    );
    const byDomain = new Map(stored.map((row) => [row.domain, row.id]));
    const checkedAt = new Date().toISOString();
    const result: Record<string, boolean | null> = {};

    for (const domain of data.domains) {
      const id = byDomain.get(domain);
      // Only ever check domains this project actually harvested -- otherwise
      // the endpoint becomes an arbitrary billed availability oracle.
      if (!id) continue;
      let available: boolean | null = null;
      try {
        available = await resolveDomainAvailability(domain, cache);
      } catch {
        available = null;
      }
      result[domain] = available;
      await HarvestedDomainRepository.setAvailability(id, available, checkedAt);
    }

    return result;
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
