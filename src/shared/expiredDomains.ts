import { getDomain } from "tldts";
import type {
  DomainExpiration,
  DomainExpirationStatus,
} from "@/shared/domainExpiration";

/**
 * Ranking and filtering for the expired-domain finder.
 *
 * Every judgement the feature makes lives here, as pure functions, so all of it
 * is directly testable -- no network, no `cloudflare:workers`, no D1. The
 * platform classifier is INJECTED rather than imported so this module stays
 * free of the competitors feature and its dependency graph.
 *
 * The load-bearing idea: relevance is scored from GRAPH EVIDENCE, never from
 * the domain name. Guessing that "nutritionhub.com" is food-adjacent by reading
 * the string is unreliable and unfalsifiable. But we already know why the
 * domain is in the candidate set at all -- it links to three of this project's
 * competitors, or it ranks for keywords this project targets. That is relevance
 * by construction, and it is what gets scored.
 */

export type CandidateEvidence = {
  /** Competitor domains this candidate links to. The strongest niche signal. */
  linksToCompetitors: string[];
  /** Project-target keywords this candidate ranks for. */
  ranksForKeywords: string[];
  /** On the project's persisted competitor list. */
  isKnownCompetitor: boolean;
};

export type Candidate = {
  /** Registrable domain (eTLD+1). */
  domain: string;
  sources: string[];
  evidence: CandidateEvidence;
};

export type FinderRow = Candidate & {
  score: number;
  /** Non-null BY CONSTRUCTION: buildFinderRows counts a null status as failed
   *  and never emits a row for it, so consumers (and the sort) never have to
   *  re-check or assert it. */
  status: DomainExpirationStatus;
  expiration: DomainExpiration;
  /** `true` registerable, `false` taken, `null` unknown. */
  available: boolean | null;
};

export type FinderSummary = {
  /** Candidates actually submitted for checking. */
  checked: number;
  /** Rows that reached the table. */
  surfaced: number;
  /** Lookups that did not answer. Reported, never silently treated as fine. */
  failed: number;
};

/**
 * Only these reach the table. `healthy` is the common case and is noise here.
 * A `null` status is UNKNOWN and is counted in `summary.failed` instead --
 * showing it as though it were fine would be the same mistake as collapsing a
 * failed lookup to 0.
 */
const SURFACED_STATUSES: readonly DomainExpirationStatus[] = [
  "expired",
  "critical",
  "warning",
];

const STATUS_ORDER: Record<DomainExpirationStatus, number> = {
  expired: 0,
  critical: 1,
  warning: 2,
  healthy: 3,
};

/**
 * Weights, in order of how much they actually tell you:
 *
 * - Linking to one of your competitors (3) -- niche-relevant by construction,
 *   and an expired domain that already links into your space is the single best
 *   acquisition target there is.
 * - Ranking for a keyword you target (2) -- relevant, but a weaker tie.
 * - Being on your competitor list (1) -- definitionally relevant, though
 *   competitor domains almost never actually lapse.
 * - Corroboration across independent sources (1 per extra source).
 */
export function scoreCandidate(candidate: Candidate): number {
  return (
    3 * candidate.evidence.linksToCompetitors.length +
    2 * candidate.evidence.ranksForKeywords.length +
    (candidate.evidence.isKnownCompetitor ? 1 : 0) +
    Math.max(0, candidate.sources.length - 1)
  );
}

/**
 * Collapse every source's list into one, keyed on the registrable domain, so a
 * domain found twice becomes one better-evidenced candidate rather than two
 * rows and two charges.
 */
export function mergeCandidates(lists: Candidate[][]): Candidate[] {
  const byDomain = new Map<string, Candidate>();

  for (const candidate of lists.flat()) {
    const domain = getDomain(candidate.domain.trim().toLowerCase());
    // An unparseable host is dropped rather than passed downstream, where it
    // would cost a billed lookup and come back as an error anyway.
    if (!domain) continue;

    const existing = byDomain.get(domain);
    if (!existing) {
      byDomain.set(domain, { ...candidate, domain });
      continue;
    }

    byDomain.set(domain, {
      domain,
      sources: [...new Set([...existing.sources, ...candidate.sources])],
      evidence: {
        linksToCompetitors: [
          ...new Set([
            ...existing.evidence.linksToCompetitors,
            ...candidate.evidence.linksToCompetitors,
          ]),
        ],
        ranksForKeywords: [
          ...new Set([
            ...existing.evidence.ranksForKeywords,
            ...candidate.evidence.ranksForKeywords,
          ]),
        ],
        isKnownCompetitor:
          existing.evidence.isKnownCompetitor ||
          candidate.evidence.isKnownCompetitor,
      },
    });
  }

  return [...byDomain.values()];
}

/**
 * Filter, score, sort, cap -- in that order, so the cap keeps the BEST
 * candidates rather than an arbitrary slice. Everything removed here is removed
 * before any money is spent.
 */
export function rankAndCap(
  candidates: Candidate[],
  options: {
    ownDomain: string;
    exclusions: string[];
    cap: number;
    classify: (domain: string) => string | null;
  },
): Candidate[] {
  const own = getDomain(options.ownDomain.trim().toLowerCase());
  const exclusions = options.exclusions
    .map((value) => value.trim().toLowerCase())
    // A blank token would substring-match every domain and empty the list.
    .filter(Boolean);

  return (
    candidates
      .filter((candidate) => candidate.domain !== own)
      // `classify` returns a category for platforms/aggregators and null for
      // anything it does not recognise -- so null is what we keep. Facebook and
      // YouTube are never acquisition targets.
      .filter((candidate) => options.classify(candidate.domain) === null)
      .filter(
        (candidate) =>
          !exclusions.some((token) => candidate.domain.includes(token)),
      )
      .map((candidate) => ({ candidate, score: scoreCandidate(candidate) }))
      .toSorted(
        (a, b) =>
          b.score - a.score ||
          a.candidate.domain.localeCompare(b.candidate.domain),
      )
      .slice(0, options.cap)
      .map((entry) => entry.candidate)
  );
}

/**
 * Join candidates to their lookup results and decide what the user sees.
 *
 * `summary` exists because "nothing found" is the COMMON outcome for a healthy
 * niche graph, and a panel that renders blank in that case looks broken. The
 * counts let the UI say what it actually examined.
 */
export function buildFinderRows(
  candidates: Candidate[],
  expirations: Map<string, DomainExpiration | null>,
  availability: Map<string, boolean | null>,
): { rows: FinderRow[]; summary: FinderSummary } {
  let failed = 0;
  const rows: FinderRow[] = [];

  for (const candidate of candidates) {
    const expiration = expirations.get(candidate.domain) ?? null;

    // Absent from the map, or resolved without a status, both mean the same
    // thing: we do not know. Neither may pass as healthy.
    if (!expiration || expiration.status === null) {
      failed += 1;
      continue;
    }

    if (!SURFACED_STATUSES.includes(expiration.status)) continue;

    rows.push({
      ...candidate,
      score: scoreCandidate(candidate),
      status: expiration.status,
      expiration,
      available: availability.get(candidate.domain) ?? null,
    });
  }

  const sorted = rows.toSorted(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      b.score - a.score ||
      a.domain.localeCompare(b.domain),
  );

  return {
    rows: sorted,
    summary: { checked: candidates.length, surfaced: sorted.length, failed },
  };
}
