import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { classifyCompetitorDomain } from "@/server/features/competitors/classifyCompetitorDomain";
import { ProjectCompetitorRepository } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";
import {
  createCompetitorsSource,
  createLinkGapSource,
  createSerpRivalsSource,
  type CandidateSource,
} from "@/server/features/expired-domains/candidateSources";
import {
  DEFAULT_CANDIDATE_CAP,
  runExpiredDomainFinder,
} from "@/server/features/expired-domains/ExpiredDomainsService";
import { ProjectProfileRepository } from "@/server/features/profiles/repositories/ProjectProfileRepository";
import { resolveDomainAvailability } from "@/server/lib/apiverve/domainAvailability";
import {
  resolveDomainExpirations,
  type ExpirationCache,
} from "@/server/lib/apiverve/domainExpiration";
import { fetchBacklinksDomainIntersection } from "@/server/lib/dataforseo/backlinks-insights";
import { fetchSerpCompetitors } from "@/server/lib/dataforseo/labs-competitors";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";

/**
 * Runs the expired-domain finder for a project.
 *
 * Deliberately ONE metered operation rather than the "free estimate, then
 * confirm" flow the plan first sketched. Collecting candidates is itself
 * metered -- the link-gap call bills DataForSEO -- so an "estimate" that had to
 * collect first would have spent money while calling itself free. Instead the
 * UI quotes the ceiling from the cap before anything runs, and the user
 * confirms once.
 *
 * Glue only: every decision that costs money lives in ExpiredDomainsService and
 * `src/shared/expiredDomains.ts`, both of which take their dependencies as
 * parameters and are unit-tested. This module holds the `cloudflare:workers`
 * import, so nothing testable may live here.
 */
const inputSchema = z.object({
  projectId: z.string().min(1),
  /** Bounded so a client cannot ask for an unbounded, unbounded-cost sweep. */
  cap: z.number().int().min(1).max(100).default(DEFAULT_CANDIDATE_CAP),
  /**
   * Optional keyword seed for the SERP-rivals source. Empty by default: that
   * source returns nothing without calling out, so v1 runs on competitors and
   * link gap until we settle which keyword list should drive it.
   */
  keywords: z.array(z.string().trim().min(1)).max(20).default([]),
});

/** `exclusions` is a free-text field; split on commas and newlines. */
function parseExclusions(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export const runExpiredDomainSearch = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(inputSchema)
  .handler(async ({ data, context }) => {
    const projectDomain = context.project.domain;
    if (!projectDomain) {
      throw new AppError(
        "PROJECT_DOMAIN_MISSING",
        "Set this project's domain before searching for expired domains",
      );
    }

    const [competitorRows, profile] = await Promise.all([
      ProjectCompetitorRepository.listByProject(context.projectId),
      ProjectProfileRepository.getByProject(context.projectId),
    ]);
    const competitorDomains = competitorRows
      .map((row) => row.domain)
      .filter(Boolean);

    const cache: ExpirationCache = {
      get: (key) => env.KV.get(key),
      put: (key, value, options) => env.KV.put(key, value, options),
    };

    const sources: CandidateSource[] = [
      createCompetitorsSource(() => Promise.resolve(competitorDomains)),
      createLinkGapSource(fetchBacklinksDomainIntersection),
      createSerpRivalsSource(fetchSerpCompetitors),
    ];

    return runExpiredDomainFinder({
      context: {
        projectDomain,
        competitorDomains,
        keywords: data.keywords,
        locationCode: context.project.locationCode,
        languageCode: "en",
      },
      sources,
      cache,
      cap: data.cap,
      exclusions: parseExclusions(profile?.exclusions ?? ""),
      classify: classifyCompetitorDomain,
      nowMs: Date.now(),
      resolveExpirations: resolveDomainExpirations,
      resolveAvailability: resolveDomainAvailability,
    });
  });
