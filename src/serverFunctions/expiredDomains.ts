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
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { resolveDomainAvailability } from "@/server/lib/apiverve/domainAvailability";
import { findAcquirableDomains } from "@/server/features/expired-domains/acquirableDomains";
import { deriveAdjacentTerms } from "@/server/features/expired-domains/adjacentTerms";
import { deriveSeedTerms } from "@/shared/domainNameCandidates";
import { hadArchivedSite } from "@/server/lib/wayback";
import {
  resolveDomainExpirations,
  type ExpirationCache,
} from "@/server/lib/apiverve/domainExpiration";
import { fetchBacklinksDomainIntersection } from "@/server/lib/dataforseo/backlinks-insights";
import { fetchSerpCompetitors } from "@/server/lib/dataforseo/labs-competitors";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { buildCacheKey, CACHE_TTL, setCached } from "@/server/lib/r2-cache";
import { RUN_FEATURES } from "@/shared/analysis-run-features";

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
   * Also search for lapsed, registerable domains in adjacent industries.
   * Generation and the archive filter are free; only names that once hosted a
   * site reach the billed availability check, capped below.
   */
  includeAcquirable: z.boolean().default(true),
  acquirableLimit: z.number().int().min(0).max(120).default(60),
  /**
   * Optional keyword override for the SERP-rivals source. Left empty, the
   * project's RANK-TRACKED keywords are used -- those are the queries the user
   * has explicitly said they care about, which makes them the most defensible
   * seed for "who else competes here".
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

/**
 * The project's rank-tracked keywords, flattened across its tracking configs.
 *
 * Deduped here so one keyword tracked under two configs is not paid for twice
 * by the per-keyword SERP endpoint. Returns `[]` when the project tracks
 * nothing, which makes the SERP-rivals source a no-op rather than an error.
 */
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
  } catch (error) {
    // A rank-tracking read failing must not take down a run whose other two
    // sources are fine.
    console.error("expired-domains.trackedKeywords failed:", error);
    return [];
  }
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

    // Rank-tracked keywords seed the SERP-rivals source. They live per tracking
    // config, so gather across the project's configs, dedupe, and let the
    // source apply its own cap -- the SERP endpoint is priced PER KEYWORD, so
    // an unbounded seed would be an unbounded bill.
    const keywords =
      data.keywords.length > 0
        ? data.keywords
        : await collectTrackedKeywords(context.projectId);

    const cache: ExpirationCache = {
      get: (key) => env.KV.get(key),
      put: (key, value, options) => env.KV.put(key, value, options),
    };

    const sources: CandidateSource[] = [
      createCompetitorsSource(() => Promise.resolve(competitorDomains)),
      createLinkGapSource(fetchBacklinksDomainIntersection),
      createSerpRivalsSource(fetchSerpCompetitors),
    ];

    const finderResult = await runExpiredDomainFinder({
      context: {
        projectDomain,
        competitorDomains,
        keywords,
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

    // The graph sources can only surface domains already connected to this
    // project, which is why a run on a vending operator returns vending. This
    // second pass generates names from the industry's own vocabulary plus
    // ADJACENT industries, and keeps the ones that had a site and are free to
    // register today -- an expired domain actually available to buy.
    let acquirable = null;
    if (data.includeAcquirable && data.acquirableLimit > 0) {
      const industryTerms = deriveSeedTerms(keywords, profile?.offer ?? "");
      acquirable = await findAcquirableDomains({
        keywords,
        profileText: profile?.offer ?? "",
        adjacentTerms: await deriveAdjacentTerms(industryTerms),
        exclude: [projectDomain, ...competitorDomains],
        cache,
        limit: data.acquirableLimit,
        hadArchivedSite,
        resolveAvailability: resolveDomainAvailability,
      });
    }

    const result = { ...finderResult, acquirable };

    // Record the run so revisiting the tab is FREE. Without this, re-opening
    // it costs another `cap * 5` credits to see the same answer.
    //
    // Best-effort `record`, not `recordOrThrow`: the row is history here, not
    // a spend guard -- the spend guard is the explicit click -- so a failed
    // write must not fail a request the user has already paid for.
    const params = {
      cap: data.cap,
      keywords,
      projectDomain,
      competitorDomains,
    };
    const cacheKey = await buildCacheKey("expired-domains", params);
    // The cache object is short-lived by design (the bucket hard-deletes this
    // prefix after 7 days); `record` immediately copies it to the durable run
    // payload, which is what restore actually reads.
    await setCached(cacheKey, result, CACHE_TTL.researchResult);
    await AnalysisRunService.record({
      projectId: context.projectId,
      feature: RUN_FEATURES.expiredDomains,
      params,
      cacheKey,
      label: projectDomain,
    });

    return result;
  });
