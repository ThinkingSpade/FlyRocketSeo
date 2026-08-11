import { applyBillingMarkupUsd } from "@/shared/billing";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { BRAND_LOOKUP_RAW_COST_USD } from "@/shared/analysis-costs";
import type { ProjectMarket } from "@/client/hooks/useProjectDomain";
import { getDomainOverview } from "@/serverFunctions/domain";
import { getBacklinksOverview } from "@/serverFunctions/backlinks";
import { getCompetitorsList } from "@/serverFunctions/competitors";
import { analyzeProjectBrand } from "@/serverFunctions/brandVisibility";
import { getPageExplorer } from "@/serverFunctions/page-explorer";
import { researchKeywords } from "@/serverFunctions/keywords";
import { getKeywordTrends } from "@/serverFunctions/trends";
import { getSerpOverview } from "@/serverFunctions/serp";
import { getContentBrief } from "@/serverFunctions/content";
import { getTopicClusters } from "@/serverFunctions/topic-clusters";
import { startAudit } from "@/serverFunctions/audit";

const markup = (rawUsd: number) =>
  isHostedClientAuthMode() ? applyBillingMarkupUsd(rawUsd) : rawUsd;

/**
 * The catalogue of analyses the "Analyze this project" card can run, and the
 * tab each one fills.
 *
 * Split out of AnalyzeProjectCard.tsx, which passed this repo's 400-line
 * ceiling once every entry gained a destination. Data here, behaviour there.
 */

export type RunStatus = "idle" | "running" | "done" | "failed";

type Analysis = {
  key: string;
  label: string;
  detail: string;
  /** The tab this analysis fills. The card promises "Each tab then opens
   *  showing its result instead of a blank form" and then rendered a
   *  checkmark and nothing else, so a finished run had no way through to the
   *  thing it just paid for. */
  to: AnalysisDestination;
  /** True when the destination takes the seed keyword as `q`. */
  carriesKeyword?: boolean;
  /** Measured cost, or null when we have no profiled figure to quote. */
  estimateUsd: number | null;
  /** True when the analysis needs a seed keyword rather than just the domain. */
  needsKeyword?: boolean;
  run: (
    projectId: string,
    domain: string,
    keyword: string,
    market: ProjectMarket,
  ) => Promise<unknown>;
};

/** Every destination the card can send you to, as a route literal so the
 *  router type-checks each one. */
type AnalysisDestination =
  | "/p/$projectId/domain"
  | "/p/$projectId/backlinks"
  | "/p/$projectId/competitors"
  | "/p/$projectId/brand-lookup"
  | "/p/$projectId/page"
  | "/p/$projectId/audit"
  | "/p/$projectId/keywords"
  | "/p/$projectId/serp"
  | "/p/$projectId/content"
  | "/p/$projectId/clusters"
  | "/p/$projectId/trends";

export const ANALYSES: Analysis[] = [
  {
    key: "domain_overview",
    to: "/p/$projectId/domain",
    label: "Domain Overview",
    detail: "Traffic, keywords and ranking distribution",
    estimateUsd: null,
    run: (projectId, domain, _keyword, market) =>
      getDomainOverview({
        data: {
          projectId,
          domain,
          includeSubdomains: true,
          locationCode: market.locationCode,
          languageCode: market.languageCode,
        },
      }),
  },
  {
    key: "backlinks",
    to: "/p/$projectId/backlinks",
    label: "Backlinks",
    detail: "Domain authority, referring domains and link profile",
    estimateUsd: null,
    run: (projectId, domain, _keyword, _market) =>
      getBacklinksOverview({ data: { projectId, target: domain } }),
  },
  {
    key: "competitors",
    to: "/p/$projectId/competitors",
    label: "Competitors",
    detail: "Domains competing for the same keywords",
    estimateUsd: null,
    run: (projectId, domain, _keyword, _market) =>
      getCompetitorsList({ data: { projectId, target: domain } }),
  },
  {
    key: "ai_visibility",
    to: "/p/$projectId/brand-lookup",
    label: "AI Visibility",
    detail: "How ChatGPT and Google AI Overview cite you",
    estimateUsd: markup(BRAND_LOOKUP_RAW_COST_USD),
    run: (projectId, _domain, _keyword, _market) =>
      analyzeProjectBrand({ data: { projectId, competitors: [] } }),
  },
  {
    key: "page_explorer",
    to: "/p/$projectId/page",
    label: "Page Explorer",
    detail: "What the homepage itself ranks for",
    estimateUsd: null,
    run: (projectId, domain, _keyword, _market) =>
      getPageExplorer({ data: { projectId, url: `https://${domain}/` } }),
  },
  {
    key: "site_audit",
    to: "/p/$projectId/audit",
    label: "Site Audit",
    detail: "Crawls the site for technical issues (runs in the background)",
    estimateUsd: null,
    run: (projectId, domain, _keyword, _market) =>
      startAudit({ data: { projectId, startUrl: `https://${domain}/` } }),
  },
  {
    key: "keyword_research",
    to: "/p/$projectId/keywords",
    carriesKeyword: true,
    label: "Keyword Research",
    detail: "Volume, difficulty and intent around the seed keyword",
    estimateUsd: null,
    needsKeyword: true,
    run: (projectId, _domain, keyword, _market) =>
      researchKeywords({ data: { projectId, keywords: [keyword] } }),
  },
  {
    key: "serp_overview",
    to: "/p/$projectId/serp",
    carriesKeyword: true,
    label: "SERP Overview",
    detail: "Who ranks top-20 for the seed keyword, and how strong they are",
    estimateUsd: null,
    needsKeyword: true,
    run: (projectId, _domain, keyword, _market) =>
      getSerpOverview({ data: { projectId, keyword } }),
  },
  {
    key: "content_brief",
    to: "/p/$projectId/content",
    carriesKeyword: true,
    label: "Content Optimizer",
    detail: "Word-count targets, subtopics and questions to cover",
    estimateUsd: null,
    needsKeyword: true,
    run: (projectId, _domain, keyword, _market) =>
      getContentBrief({ data: { projectId, keyword } }),
  },
  {
    key: "topic_clusters",
    to: "/p/$projectId/clusters",
    carriesKeyword: true,
    label: "Topic Clusters",
    detail: "Hub-and-spoke content plan around the seed keyword",
    estimateUsd: null,
    needsKeyword: true,
    run: (projectId, _domain, keyword, _market) =>
      getTopicClusters({ data: { projectId, topic: keyword } }),
  },
  {
    key: "keyword_trends",
    to: "/p/$projectId/trends",
    carriesKeyword: true,
    label: "Keyword Trends",
    detail: "Search interest for the seed keyword over time",
    estimateUsd: null,
    needsKeyword: true,
    run: (projectId, _domain, keyword, market) =>
      getKeywordTrends({
        data: {
          projectId,
          keywords: [keyword],
          languageCode: market.languageCode,
          locationCode: market.locationCode,
        },
      }),
  },
];
