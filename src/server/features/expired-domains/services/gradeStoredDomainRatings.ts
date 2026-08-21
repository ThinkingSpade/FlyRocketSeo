import {
  MAX_DOMAIN_RATING_ATTEMPTS,
  gradeHarvestedDomainRatings,
} from "@/server/features/expired-domains/domainRatingGrading";
import { DomainRatingQueueRepository } from "@/server/features/expired-domains/repositories/DomainRatingQueueRepository";
import {
  resolveDomainRating,
  type RatingCache,
} from "@/server/lib/ahrefsDomainRating";

/**
 * Repository/runtime wiring shared by the cron and the explicit free action.
 * APIVerve is intentionally absent: this path performs only free Ahrefs DR
 * lookups and D1/Postgres writes.
 */
export function gradeStoredDomainRatings(
  projectIdScope: string | null,
  cache: RatingCache,
  domains?: string[],
) {
  return gradeHarvestedDomainRatings(
    { projectId: projectIdScope, domains },
    {
      listCandidates: ({ projectId, limit, maxAttempts }) =>
        DomainRatingQueueRepository.listCandidates(
          projectId,
          limit,
          maxAttempts,
          undefined,
          domains ?? null,
        ),
      countUngraded: ({ projectId }) =>
        DomainRatingQueueRepository.countUngraded(projectId, domains ?? null),
      claimAttempt: (candidate) =>
        DomainRatingQueueRepository.claimAttempt(
          candidate,
          MAX_DOMAIN_RATING_ATTEMPTS,
        ),
      resolveRating: (domain) => resolveDomainRating(domain, cache),
      completeAttempt: (input) =>
        DomainRatingQueueRepository.completeAttempt(input),
      releaseAttempt: async (input) => {
        await DomainRatingQueueRepository.releaseAttempt(input);
      },
      logFailures: (line) => console.error(line),
    },
  );
}
