/**
 * Free Ahrefs DR grading for harvested domains.
 *
 * Runtime and persistence dependencies are injected so this batch policy stays
 * reachable from Node Vitest without importing `cloudflare:workers`.
 */

import {
  MAX_DOMAIN_RATING_ATTEMPTS,
  MAX_DOMAIN_RATING_LOOKUPS,
} from "@/shared/workerQueryBudget";

export {
  MAX_DOMAIN_RATING_ATTEMPTS,
  MAX_DOMAIN_RATING_LOOKUPS,
} from "@/shared/workerQueryBudget";

export const DOMAIN_RATING_CONCURRENCY = 3;

export type DomainRatingCandidate = {
  id: string;
  domain: string;
  domainRatingAttempts: number;
};

type DomainRatingFailure = {
  domain: string;
  reason: string;
};

export type DomainRatingGradingDependencies = {
  /** Returns eligible rows newest first. */
  listCandidates(input: {
    projectId: string | null;
    domains?: string[];
    limit: number;
    maxAttempts: number;
  }): Promise<DomainRatingCandidate[]>;
  countUngraded(input: {
    projectId: string | null;
    domains?: string[];
  }): Promise<number>;
  /** Compare-and-swap claim; null means another invocation won the row. */
  claimAttempt(candidate: DomainRatingCandidate): Promise<string | null>;
  resolveRating(domain: string): Promise<number | null>;
  completeAttempt(input: {
    id: string;
    claimId: string;
    rating: number;
  }): Promise<boolean>;
  releaseAttempt(input: { id: string; claimId: string }): Promise<void>;
  /** Called at most once per batch with one newline-free log line. */
  logFailures(line: string): void;
};

type GradeResult = {
  attempted: number;
  graded: number;
  failed: number;
  /** All rows in this scope that remain ungraded. */
  remaining: number;
};

function failureReason(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().replace(/\s+/g, " ");
  }
  const reason = String(error).trim();
  return reason ? reason.replace(/\s+/g, " ") : "unknown failure";
}

async function gradeClaimedCandidate(
  candidate: DomainRatingCandidate,
  claimId: string,
  dependencies: DomainRatingGradingDependencies,
): Promise<{ graded: boolean; reason: string | null }> {
  let graded = false;
  let reason: string | null = null;
  let completionAttempted = false;

  try {
    const rating = await dependencies.resolveRating(candidate.domain);
    // null means UNKNOWN and must remain null. Zero is a real grade.
    if (rating === null) {
      reason = "unknown rating";
    } else {
      // Once completion has been attempted, a false result means this token no
      // longer owns the row. A thrown write may have reached D1. In either
      // case a release would be a sixth subrequest and cannot safely improve
      // the result; an owned lease will expire on its normal short timeout.
      completionAttempted = true;
      const stored = await dependencies.completeAttempt({
        id: candidate.id,
        claimId,
        rating,
      });
      if (stored) graded = true;
      else reason = "grading claim expired before storage";
    }
  } catch (error) {
    reason = failureReason(error);
  }

  if (!graded && !completionAttempted) {
    try {
      await dependencies.releaseAttempt({ id: candidate.id, claimId });
    } catch (error) {
      const releaseReason = `release failed: ${failureReason(error)}`;
      reason = reason ? `${reason}; ${releaseReason}` : releaseReason;
    }
  }

  return { graded, reason };
}

export async function gradeHarvestedDomainRatings(
  input: { projectId: string | null; domains?: string[] },
  dependencies: DomainRatingGradingDependencies,
): Promise<GradeResult> {
  const listed = await dependencies.listCandidates({
    projectId: input.projectId,
    domains: input.domains,
    limit: MAX_DOMAIN_RATING_LOOKUPS,
    maxAttempts: MAX_DOMAIN_RATING_ATTEMPTS,
  });
  // Keep the policy bound here as well as in the repository. That makes a
  // future repository regression unable to turn one invocation into an
  // unbounded burst against Ahrefs' public endpoint.
  const candidates = listed
    .slice(0, MAX_DOMAIN_RATING_LOOKUPS)
    .filter(
      (candidate) =>
        candidate.domainRatingAttempts < MAX_DOMAIN_RATING_ATTEMPTS,
    );

  let cursor = 0;
  let attempted = 0;
  let graded = 0;
  const failures: Array<DomainRatingFailure & { index: number }> = [];

  const gradeNext = async (): Promise<void> => {
    while (cursor < candidates.length) {
      const index = cursor;
      cursor += 1;
      const candidate = candidates[index];
      if (!candidate) continue;

      let claimId: string | null;
      try {
        claimId = await dependencies.claimAttempt(candidate);
      } catch (error) {
        failures.push({
          index,
          domain: candidate.domain,
          reason: failureReason(error),
        });
        continue;
      }
      if (claimId === null) continue;

      attempted += 1;
      const outcome = await gradeClaimedCandidate(
        candidate,
        claimId,
        dependencies,
      );
      if (outcome.graded) {
        graded += 1;
      } else {
        failures.push({
          index,
          domain: candidate.domain,
          reason: outcome.reason ?? "unknown failure",
        });
      }
    }
  };

  await Promise.all(
    Array.from(
      {
        length: Math.min(DOMAIN_RATING_CONCURRENCY, candidates.length),
      },
      () => gradeNext(),
    ),
  );

  const orderedFailures = failures
    .toSorted((left, right) => left.index - right.index)
    .map(({ domain, reason }) => ({ domain, reason }));
  if (orderedFailures.length > 0) {
    dependencies.logFailures(
      `expired-domains.domain-rating failures: ${orderedFailures
        .map(({ domain, reason }) => `${domain}: ${reason}`)
        .join("; ")}`,
    );
  }

  const remaining = await dependencies.countUngraded({
    projectId: input.projectId,
    domains: input.domains,
  });

  return {
    attempted,
    graded,
    failed: orderedFailures.length,
    remaining,
  };
}
