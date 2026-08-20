import { mapIntersectionRows } from "@/server/features/backlinks/services/backlinksCompareMappers";
import type { fetchBacklinksDomainIntersection } from "@/server/lib/dataforseo/backlinks-insights";
import type { fetchSerpCompetitors } from "@/server/lib/dataforseo/labs-competitors";
import { asAppError } from "@/server/lib/errors";
import type { Candidate } from "@/shared/expiredDomains";

/**
 * Where expired-domain candidates come from.
 *
 * APIVerve can only tell you whether a domain you NAME has lapsed -- it cannot
 * discover domains. So the candidates have to come from somewhere we already
 * know is the project's niche, and that is what these sources are.
 *
 * Every fetcher is INJECTED rather than imported directly, so each source is
 * unit-testable with no network, no DataForSEO key, and no billing. A future
 * drop-list feed implements the same interface and needs no pipeline change.
 */

export type FinderContext = {
  projectDomain: string;
  competitorDomains: string[];
  keywords: string[];
  locationCode: number;
  languageCode: string;
};

export type CandidateSource = {
  readonly name: string;
  /** True when collecting from this source costs DataForSEO credits. */
  readonly metered: boolean;
  /**
   * Why this source cannot run for this project, or null when it can.
   *
   * A source that silently returns nothing is worse than one that errors: it
   * gets counted as searched, and the summary then claims coverage it never
   * had. That is exactly what happened on a project with no saved competitors
   * -- link gap contributed nothing, the run reported "50 checked", and the
   * user reasonably concluded the feature was just weak.
   */
  unavailableReason(context: FinderContext): string | null;
  collect(context: FinderContext): Promise<Candidate[]>;
};

const MAX_LINK_GAP_ROWS = 200;
const MAX_SERP_RIVALS = 100;
/** SERP competitors are priced per keyword, so the seed list is bounded. */
const MAX_SERP_KEYWORDS = 20;

function emptyEvidence(): Candidate["evidence"] {
  return {
    linksToCompetitors: [],
    ranksForKeywords: [],
    isKnownCompetitor: false,
  };
}

/**
 * The project's own saved competitor list. Free -- these rows are already in
 * D1, so this source costs nothing and always runs.
 *
 * Low yield by nature: an operating competitor rarely lets its domain lapse.
 * It earns its place because it is free and because a competitor that DID lapse
 * is the single most valuable row this feature could ever produce.
 */
export function createCompetitorsSource(
  listCompetitors: (context: FinderContext) => Promise<string[]>,
): CandidateSource {
  return {
    name: "competitors",
    metered: false,
    unavailableReason: (context) =>
      context.competitorDomains.length === 0
        ? "no competitors saved for this project"
        : null,
    async collect(context) {
      const domains = await listCompetitors(context);
      return domains.map((domain) => ({
        domain,
        sources: ["competitors"],
        evidence: { ...emptyEvidence(), isKnownCompetitor: true },
      }));
    },
  };
}

/**
 * Domains that link to the project's competitors but not to the project.
 *
 * The strongest source here: a domain in this set is niche-relevant BY
 * CONSTRUCTION -- it already chose to link into this space. An expired one is
 * both a link you could reclaim and a domain you could buy.
 *
 * `mapIntersectionRows` is reused rather than reimplemented: it owns the
 * subtlety that `domain_intersection` keys are 1-based indices into the request
 * targets, so key `n` means "links to competitors[n-1]".
 */
export function createLinkGapSource(
  fetchIntersection: typeof fetchBacklinksDomainIntersection,
): CandidateSource {
  return {
    name: "link-gap",
    metered: true,
    // This is the source that reaches ADJACENT domains -- food and nutrition
    // sites that link to a vending competitor, say. Without competitors it can
    // do nothing, and the run collapses to whatever SERP rivals finds, which is
    // by definition more of the same vertical.
    unavailableReason: (context) =>
      context.competitorDomains.length === 0
        ? "no competitors saved — link gap is what finds adjacent sites, so add a few on the Competitors tab"
        : null,
    async collect(context) {
      const response = await fetchIntersection({
        targets: context.competitorDomains,
        excludeTargets: [context.projectDomain],
        limit: MAX_LINK_GAP_ROWS,
      });

      return mapIntersectionRows(
        response.data.items,
        context.competitorDomains,
      ).map((row) => ({
        domain: row.domain,
        sources: ["link-gap"],
        evidence: { ...emptyEvidence(), linksToCompetitors: row.linkedTo },
      }));
    },
  };
}

/**
 * Domains appearing in the SERPs for the project's own target keywords.
 *
 * Weaker evidence than a link, but it reaches domains with no backlink
 * relationship to the competitor set at all.
 */
export function createSerpRivalsSource(
  fetchSerp: typeof fetchSerpCompetitors,
): CandidateSource {
  return {
    name: "serp-rivals",
    metered: true,
    unavailableReason: (context) =>
      context.keywords.length === 0
        ? "no rank-tracked keywords for this project"
        : null,
    async collect(context) {
      const keywords = context.keywords.slice(0, MAX_SERP_KEYWORDS);
      const response = await fetchSerp({
        keywords,
        locationCode: context.locationCode,
        languageCode: context.languageCode,
        limit: MAX_SERP_RIVALS,
      });

      const candidates: Candidate[] = [];
      for (const item of response.data.items) {
        const domain = typeof item.domain === "string" ? item.domain : "";
        if (!domain) continue;
        // The project's own domain ranks for its own keywords; it is never a
        // candidate. rankAndCap strips it too, but not spending a lookup on it
        // is cheaper than filtering it later.
        if (domain === context.projectDomain) continue;

        const positions = item.keywords_positions ?? {};
        const ranksForKeywords = keywords.filter(
          (keyword) => (positions[keyword]?.length ?? 0) > 0,
        );

        candidates.push({
          domain,
          sources: ["serp-rivals"],
          evidence: { ...emptyEvidence(), ranksForKeywords },
        });
      }
      return candidates;
    },
  };
}

type CollectedCandidates = {
  lists: Candidate[][];
  sourcesUsed: string[];
  sourceErrors: { source: string; code: string }[];
  /** Sources that could not run at all, and why. Surfaced to the user. */
  sourcesSkipped: { source: string; reason: string }[];
};

/**
 * Run the enabled sources and gather what they found.
 *
 * A source that throws is RECORDED and skipped, never fatal: a DataForSEO
 * billing problem on the link-gap call must not take down the free competitor
 * rows too. `sourcesUsed` is what the UI reports back ("checked 50 domains from
 * link gap and competitors"), so it must list only sources that actually
 * answered -- otherwise the empty state would claim coverage it never had.
 */
export async function collectCandidates(
  sources: CandidateSource[],
  context: FinderContext,
): Promise<CollectedCandidates> {
  const lists: Candidate[][] = [];
  const sourcesUsed: string[] = [];
  const sourceErrors: { source: string; code: string }[] = [];
  const sourcesSkipped: { source: string; reason: string }[] = [];

  for (const source of sources) {
    const reason = source.unavailableReason(context);
    if (reason !== null) {
      // Recorded, NOT counted as used. The summary must never imply a source
      // searched when it could not.
      sourcesSkipped.push({ source: source.name, reason });
      continue;
    }
    try {
      lists.push(await source.collect(context));
      sourcesUsed.push(source.name);
    } catch (error) {
      sourceErrors.push({
        source: source.name,
        code: asAppError(error)?.code ?? "INTERNAL_ERROR",
      });
    }
  }

  return { lists, sourcesUsed, sourceErrors, sourcesSkipped };
}
