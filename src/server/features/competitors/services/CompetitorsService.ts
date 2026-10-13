import { providerCount } from "@/shared/provider-observations";
import { keywordEstimate } from "@/shared/keyword-observations";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { AnalysisRunService } from "@/server/features/analysis-runs/services/analysisRuns";
import { RUN_FEATURES } from "@/shared/analysis-run-features";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  normalizeDiscoveredDomain,
  normalizeDomainInput,
} from "@/server/lib/domainUtils";
import { getKeywordGap, getLinkGap } from "./CompetitorGapsService";
export type {
  KeywordGapRow,
  KeywordGapPage,
  LinkGapRow,
  LinkGapPage,
} from "./CompetitorGapsService";
import { isRecord } from "@/server/lib/dataforseo/envelope";
import type { CompetitorDomainItem } from "@/server/lib/dataforseo/labs-competitors";
import {
  competitorsPageSchema,
  type CompetitorRow,
  type CompetitorsPage,
} from "@/types/schemas/competitors";
import { GscService } from "@/server/features/gsc/services/GscService";
import { GSC_ANALYTICS_ROW_CEILING } from "@/server/features/gsc/searchAnalytics";
import { pullWasTruncated } from "@/server/features/gsc/fetchAllRows";
import { toDimensionRows } from "@/server/features/gsc/searchPerformanceReport";
import { ProjectProfileRepository } from "@/server/features/profiles/repositories/ProjectProfileRepository";
import { ProjectCompetitorRepository } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";
import { buildCompetitorSeed } from "@/server/features/competitors/competitorSeed";
import { rankSerpCompetitors } from "@/server/features/competitors/rankSerpCompetitors";
import { classifyCompetitorDomain } from "@/server/features/competitors/classifyCompetitorDomain";
import { reapplyProjectCompetitors } from "@/server/features/competitors/applyProjectCompetitors";
import { resolveDiscoveryMode } from "@/server/features/competitors/resolveDiscoveryMode";

/** Competitor and keyword-gap data refresh cadence, matching domain overview. */
const COMPETITORS_TTL_SECONDS = 12 * 60 * 60;

// Re-exported so the tables that render these rows keep importing the type
// from the service they came from.
export type { CompetitorRow };

function readMetric(container: unknown, key: string): number | null {
  if (!isRecord(container)) return null;
  const organic = container.organic;
  if (!isRecord(organic)) return null;
  const value = organic[key];
  return key === "count" ? providerCount(value) : keywordEstimate(value);
}

function mapCompetitorItem(item: CompetitorDomainItem): CompetitorRow | null {
  if (!item.domain) return null;
  // Normalized the same way ProjectCompetitorRepository normalizes a saved
  // pin/exclude override, and the same way the serp-seeded path normalizes
  // its own rows (rankSerpCompetitors) -- see normalizeDiscoveredDomain's
  // doc comment. Without this, a discovered "WWW.Avfusa.com" would never
  // match a pin saved as "avfusa.com" and applyProjectCompetitors would
  // silently no-op. Classified from this same normalized value so the
  // category always describes the domain the row actually carries.
  const domain = normalizeDiscoveredDomain(item.domain);
  return {
    domain,
    avgPosition:
      keywordEstimate(item.avg_position) !== null && item.avg_position! > 0
        ? item.avg_position!
        : null,
    intersections: providerCount(item.intersections),
    organicKeywords: readMetric(item.full_domain_metrics, "count"),
    organicTraffic: readMetric(item.full_domain_metrics, "etv"),
    // These rows come from the domain-overlap fallback path, which has no
    // discovery metrics and is not seeded. Legacy rows report this honestly.
    coverage: null,
    beatsYouCount: null,
    positionDelta: null,
    source: "domain",
    pinned: false,
    // Classification is mode-agnostic (a pure function of the domain
    // string), so a platform showing up via the domain-overlap fallback --
    // e.g. a mega-site like youtube.com sharing keywords with everyone --
    // gets the same advisory category a serp-mode row would.
    category: classifyCompetitorDomain(domain),
  };
}

async function getCompetitors(
  input: {
    projectId: string;
    target: string;
    locationCode: number;
    languageCode: string;
    excludeTopDomains: boolean;
    page: number;
    pageSize: number;
  },
  billingCustomer: BillingCustomerContext,
): Promise<CompetitorsPage> {
  const target = normalizeDomainInput(input.target, true);

  // Free (one D1 read via GscConnectionRepository, not the full performance
  // pull) and resolved before the cache key so a result produced under one
  // GSC connection state is never served back under a different one. Without
  // this, a project's first (not-yet-connected) run would cache a
  // discoveryMode:"domain" result for COMPETITORS_TTL_SECONDS; connecting
  // Search Console minutes later and re-running would silently return that
  // same stale domain-mode page instead of a fresh keyword-seeded one, with
  // no signal that a better answer was now possible.
  //
  // This does not close every staleness gap the connection state can create
  // -- the connection identity is captured, but grant validity still needs I/O. "Connected, but the seed
  // is below MIN_COMPETITOR_SEED" and "connected, but the grant is revoked"
  // both still share a cache key with "connected with a good seed", since
  // neither is knowable without the full (non-free) performance pull this
  // cache key is built to avoid on a hit.
  const gscConnection = await GscService.getConnection(input.projectId);
  const hasGscConnection = gscConnection != null;

  const cacheKey = await buildCacheKey("competitors:list", {
    contractVersion: 2,
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    target,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    excludeTopDomains: input.excludeTopDomains,
    page: input.page,
    pageSize: input.pageSize,
    hasGscConnection,
    gscIdentity: gscConnection
      ? {
          id: gscConnection.id,
          siteUrl: gscConnection.siteUrl,
          connectedByUserId: gscConnection.connectedByUserId,
        }
      : null,
  });

  // Records this analysis for the tab's history / auto-restore. Free and best
  // effort: one row pointing at the cache key we just used, so the tab can
  // render this exact result again without a metered fetch.
  //
  // First page only. The cache key is page-specific, so recording deeper pages
  // would let "your last run" restore page 3's rows into a tab that presents
  // them as the first page.
  const recordRun = async () => {
    if (input.page !== 1) return;
    await AnalysisRunService.record({
      projectId: input.projectId,
      feature: RUN_FEATURES.competitors,
      params: {
        target: input.target,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        excludeTopDomains: input.excludeTopDomains,
      },
      cacheKey,
      label: target,
    });
  };

  const cached = competitorsPageSchema.safeParse(await getCached(cacheKey));
  if (
    cached.success &&
    cached.data.contractVersion === 2 &&
    cached.data.scope?.projectId === input.projectId &&
    cached.data.scope.target === target &&
    cached.data.scope.locationCode === input.locationCode &&
    cached.data.scope.languageCode === input.languageCode &&
    cached.data.scope.page === input.page &&
    cached.data.scope.pageSize === input.pageSize
  ) {
    await recordRun();
    // Free D1 read. `cached.data.rows` is the PRISTINE discovery result (see
    // reapplyProjectCompetitors's own doc comment for why that invariant
    // matters) -- exclusions/pins may have changed since this page was
    // cached, and a cache hit must never hand back a domain the project has
    // since excluded, or omit hiddenCount for one it has.
    const overrides = await ProjectCompetitorRepository.listByProject(
      input.projectId,
    );
    return reapplyProjectCompetitors(cached.data, overrides);
  }

  // Moved above the seed-building block below: both the serp and the
  // domain-overlap branch need it, and the serp branch returns early.
  const dataforseo = createDataforseoClient(billingCustomer);

  // Free inputs first: a seed costs nothing, and its size decides whether the
  // metered keyword-seeded call is worth making at all.
  const [profile, overrides] = await Promise.all([
    ProjectProfileRepository.getByProject(input.projectId),
    ProjectCompetitorRepository.listByProject(input.projectId),
  ]);

  let seedKeywords: ReturnType<typeof buildCompetitorSeed>["keywords"] = [];
  let hasGsc = false;
  // Whether the GSC pull the seed was drawn from came back AT the row
  // ceiling. GSC orders rows by CLICKS descending and documents that it
  // returns top rows rather than every matching row (fetchAllRows.ts's own
  // doc comment has the full citation) -- so a full pull means queries where
  // the client sits at, say, position 20-40 (real impressions, near-zero
  // clicks) may have been sorted out of the window before buildCompetitorSeed
  // ever saw them. Those are exactly the queries this feature exists to find
  // rivals for, so a truncated pull makes the seed a biased sample, not a
  // representative one -- see `seedTruncated` on the result below.
  let seedTruncated = false;
  // The try/catch wraps ONLY the GSC I/O call. A connection problem, revoked
  // grant, or API failure all mean "no seed", and the domain-overlap
  // fallback below is a real answer -- but the pure transforms after this
  // block (toDimensionRows/filter, buildCompetitorSeed) are deliberately
  // OUTSIDE it: if a future change introduces a bug in either (e.g. a
  // null-deref for some row shape), it must fail loudly, not get silently
  // absorbed into "GSC not connected" and serve domain-mode results forever
  // for a project whose GSC connection is actually fine.
  // Named to avoid shadowing the global `performance` (Web/Node Performance
  // API).
  let gscPerformance:
    | Awaited<ReturnType<typeof GscService.getAnalyticsPerformance>>
    | undefined;
  try {
    // getAnalyticsPerformance, not getPerformance: this is an analytics
    // caller building a market-wide seed, not the MCP path getPerformance
    // defaults to guarding (see its own doc comment, GscService.ts). Asking
    // for the full GSC_ANALYTICS_ROW_CEILING (rather than a smaller number
    // that still gets clamped to it) is what makes `pullWasTruncated` below
    // able to ever observe "not truncated" -- requesting less than the
    // ceiling would make a full page ambiguous between "this is everything"
    // and "we stopped asking early".
    gscPerformance = await GscService.getAnalyticsPerformance({
      projectId: input.projectId,
      dimensions: ["query"],
      dateRange: "last_28_days",
      rowLimit: GSC_ANALYTICS_ROW_CEILING,
      // Demand totals, not page-attribution rows: left unset this defaults to
      // "auto" and Google picks, which for query-dimension rows can still
      // double-count a query that surfaces through two of the property's URLs.
      // See GscPerformanceInput's own doc comment (searchAnalytics.ts).
      aggregationType: "byProperty",
    });
    hasGsc = true;
  } catch {
    // No connection, revoked grant, or an API failure: all mean "no seed".
    // The fallback below is a real answer, so this must not fail the request.
    hasGsc = false;
  }

  if (gscPerformance) {
    // Compare against the limit the request ACTUALLY applied (clamped), never
    // the limit asked for -- see pullWasTruncated's own doc comment.
    seedTruncated = pullWasTruncated({
      rows: gscPerformance.rows,
      request: gscPerformance.request,
    });
    // GSC only returns rows with at least one impression, so `impressions <=
    // 0` should not occur here in practice -- but this is the first seam
    // where a real GSC row (rather than a hand-built fixture) reaches
    // buildCompetitorSeed, and this codebase's own convention elsewhere
    // (searchPerformanceReport.ts's `sumSearchTotals`) is that `position: 0`
    // reads as "no impressions", not "ranks #1". buildCompetitorSeed buckets
    // `selfPosition <= 1.5` as "already owned" and deprioritizes it; trusting
    // a zero-impression row there would misfile "no rank signal at all" as
    // "the client ranks #1", so it is dropped before seeding rather than left
    // for buildCompetitorSeed to (mis)classify.
    const dimensionRows = toDimensionRows(gscPerformance.rows).filter(
      (row) => row.impressions > 0,
    );
    seedKeywords = buildCompetitorSeed(dimensionRows, {
      brandTerms: profile?.brandTerms ?? "",
    }).keywords;
  }

  const mode = resolveDiscoveryMode(seedKeywords.length, hasGsc);

  if (mode === "serp") {
    const response = await dataforseo.competitors.serpCompetitors({
      keywords: seedKeywords.map((k) => k.keyword),
      // KNOWN GAP: input.locationCode is the project's onboarding-time
      // country selection (useProjectMarket -> projects.locationCode), NOT
      // the confirmed project_target_areas row. Competitors is not one of
      // the six tabs wired into useTargetAreaScope/resolveRunGeo (see
      // useTargetAreaScope.ts's own enumeration), so a regional operator's
      // confirmed metro never reaches this call today -- it is measured
      // against national SERPs regardless of what the project has confirmed
      // elsewhere in the app. Fixing it means adding Competitors as a
      // seventh consumer of that system (a GeoNeed variant, a competitors
      // geo-bundle schema, header UI, capture-at-authorize, and restore-path
      // changes across several files, mirroring SerpOverviewPage.tsx) --
      // deliberately not attempted here; this comment is the record of the
      // gap until that follow-up happens.
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
      // Organic only. The endpoint's default item types include paid
      // results, which would let a rival's AD placement count as outranking
      // the client's organic GSC position.
      itemTypes: ["organic"],
    });

    const ranked = rankSerpCompetitors(response.items, seedKeywords, target);

    // PRISTINE: no pin/exclude view applied. Cached and recorded exactly as
    // the vendor produced it -- see reapplyProjectCompetitors's own doc
    // comment for why a stored page must never carry a prior override
    // application. `hiddenCount: 0` is honest here, not a placeholder: zero
    // rows have been hidden from a page nothing has been applied to yet.
    const stored: CompetitorsPage = {
      contractVersion: 2,
      provider: "DataForSEO Labs",
      scope: {
        projectId: input.projectId,
        target,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        page: input.page,
        pageSize: input.pageSize,
      },
      rows: ranked,
      hasMore:
        providerCount(response.totalCount) !== null
          ? input.page * input.pageSize < response.totalCount!
          : response.items.length === input.pageSize,
      totalCount: providerCount(response.totalCount),
      fetchedAt: new Date().toISOString(),
      seedSize: seedKeywords.length,
      hiddenCount: 0,
      discoveryMode: "serp",
      seedTruncated,
    };

    {
      // AWAITED, not fire-and-forget: `recordRun` below makes the run's durable
      // copy by READING THIS OBJECT BACK (AnalysisRunService.record ->
      // getCachedRawIgnoringTtl -> putRunPayload). An un-awaited write races
      // that read, and when the read loses there is no durable payload at all,
      // so the run survives only as long as the 7-day `dataforseo-cache/`
      // lifecycle -- which is exactly the "expired" state users hit on runs far
      // younger than the retention they were promised.
      const written = await setCached(cacheKey, stored, COMPETITORS_TTL_SECONDS)
        .then(() => true)
        .catch((error) => {
          console.error("competitors.list.cache-write failed:", error);
          return false;
        });
      if (written) await recordRun();
    }

    return reapplyProjectCompetitors(stored, overrides);
  }

  const response = await dataforseo.competitors.domainCompetitors({
    target,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
    excludeTopDomains: input.excludeTopDomains,
    // Rank by shared-keyword volume so obvious rivals surface first.
    orderBy: ["intersections,desc"],
  });

  const rows = response.items
    .map(mapCompetitorItem)
    .filter((row): row is CompetitorRow => row != null)
    // The target itself is always its own top "competitor"; drop it.
    .filter((row) => row.domain !== target);

  // PRISTINE, same reasoning as the serp branch above.
  const stored: CompetitorsPage = {
    contractVersion: 2,
    provider: "DataForSEO Labs",
    scope: {
      projectId: input.projectId,
      target,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      page: input.page,
      pageSize: input.pageSize,
    },
    rows,
    hasMore:
      providerCount(response.totalCount) !== null
        ? input.page * input.pageSize < response.totalCount!
        : response.items.length === input.pageSize,
    totalCount: providerCount(response.totalCount),
    fetchedAt: new Date().toISOString(),
    // This endpoint is the domain-overlap fallback path: no seed keywords,
    // and domain-based ranking (not SERP-seeded) -- but pin/exclude still
    // applies, same as the serp path.
    seedSize: 0,
    hiddenCount: 0,
    discoveryMode: "domain",
    // No seed was consulted to produce this answer, so there is no seed bias
    // to report here even if the GSC pull above happened to come back full.
    seedTruncated: false,
  };

  {
    // Awaited for the same reason as the serp branch above: `recordRun` reads
    // this object back to make the run's durable copy.
    const written = await setCached(cacheKey, stored, COMPETITORS_TTL_SECONDS)
      .then(() => true)
      .catch((error) => {
        console.error("competitors.list.cache-write failed:", error);
        return false;
      });
    if (written) await recordRun();
  }

  return reapplyProjectCompetitors(stored, overrides);
}

export const CompetitorsService = {
  getCompetitors,
  getKeywordGap,
  getLinkGap,
} as const;
