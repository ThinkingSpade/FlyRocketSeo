import {
  collectCandidates,
  type CandidateSource,
  type FinderContext,
} from "@/server/features/expired-domains/candidateSources";
import type { resolveDomainAvailability } from "@/server/lib/apiverve/domainAvailability";
import type {
  ExpirationCache,
  resolveDomainExpirations,
} from "@/server/lib/apiverve/domainExpiration";
import {
  buildFinderRows,
  mergeCandidates,
  rankAndCap,
  type FinderRow,
  type FinderSummary,
} from "@/shared/expiredDomains";

/**
 * Orchestrates the expired-domain finder: collect candidates from the project's
 * niche graph, rank and cap them, then check only that capped set against
 * APIVerve.
 *
 * Both resolvers are INJECTED so the two rules that actually cost money --
 * "only the capped set is looked up" and "availability is only checked for
 * domains that already lapsed" -- are directly testable with no network.
 */

export const DEFAULT_CANDIDATE_CAP = 50;
export const CREDITS_PER_LOOKUP = 5;

type FinderResult = {
  rows: FinderRow[];
  summary: FinderSummary;
  sourcesUsed: string[];
  sourceErrors: { source: string; code: string }[];
  sourcesSkipped: { source: string; reason: string }[];
};

/**
 * What a run will cost, quoted BEFORE anything is spent.
 *
 * Only the expiration sweep is quoted. Availability is deliberately excluded:
 * it is charged for the expired subset only, which is usually zero to a
 * handful, and quoting `count * 2 * 5` up front would over-state the bill by
 * roughly double. The UI says "plus a few more if any have lapsed" instead of
 * inventing a precise number it cannot know yet.
 */
export function estimateFinderCost(candidateCount: number): {
  candidateCount: number;
  expirationCredits: number;
} {
  return {
    candidateCount,
    expirationCredits: candidateCount * CREDITS_PER_LOOKUP,
  };
}

export async function runExpiredDomainFinder(input: {
  context: FinderContext;
  sources: CandidateSource[];
  cache: ExpirationCache;
  cap: number;
  exclusions: string[];
  classify: (domain: string) => string | null;
  nowMs: number;
  resolveExpirations: typeof resolveDomainExpirations;
  resolveAvailability: typeof resolveDomainAvailability;
}): Promise<FinderResult> {
  const collected = await collectCandidates(input.sources, input.context);

  // Everything cheap happens before anything billed: merge, strip the project's
  // own domain and known platforms, score, cap.
  const capped = rankAndCap(mergeCandidates(collected.lists), {
    ownDomain: input.context.projectDomain,
    exclusions: input.exclusions,
    cap: input.cap,
    classify: input.classify,
  });

  if (capped.length === 0) {
    return {
      rows: [],
      summary: { checked: 0, surfaced: 0, failed: 0 },
      sourcesUsed: collected.sourcesUsed,
      sourceErrors: collected.sourceErrors,
      sourcesSkipped: collected.sourcesSkipped,
    };
  }

  const expirations = await input.resolveExpirations(
    capped.map((candidate) => candidate.domain),
    input.cache,
    input.nowMs,
  );

  // Availability ONLY for domains that actually lapsed. A live domain cannot be
  // registered, so asking about it would burn 5 credits to learn nothing.
  const expiredDomains = capped
    .map((candidate) => candidate.domain)
    .filter((domain) => expirations.get(domain)?.status === "expired");

  const availability = new Map<string, boolean | null>();
  for (const domain of expiredDomains) {
    try {
      availability.set(
        domain,
        await input.resolveAvailability(domain, input.cache),
      );
    } catch {
      // Unknown, not "taken". Losing the availability answer must not lose the
      // row -- an expired domain is worth showing either way.
      availability.set(domain, null);
    }
  }

  const { rows, summary } = buildFinderRows(capped, expirations, availability);

  return {
    rows,
    summary,
    sourcesUsed: collected.sourcesUsed,
    sourceErrors: collected.sourceErrors,
    sourcesSkipped: collected.sourcesSkipped,
  };
}
