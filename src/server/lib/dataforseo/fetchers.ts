// Aggregates every DataForSEO section fetcher behind one module so client.ts
// can reach them through a single dynamic import(). That import is what keeps
// the 1.6 MB dataforseo-client SDK (which the leaf modules pull in) out of the
// Worker's startup module graph — it becomes an on-demand chunk loaded on the
// first metered call instead of parsed on every cold isolate.
export {
  fetchBusinessListingsSearch,
  fetchMyBusinessInfo,
  fetchQuestionsAnswers,
  postGoogleReviewsTask,
} from "./business";
export {
  fetchBacklinksHistory,
  fetchBacklinksRows,
  fetchBacklinksSummary,
  fetchDomainPagesSummary,
  fetchReferringDomains,
} from "./backlinks";
export {
  fetchBacklinksAnchors,
  fetchBacklinksCompetitors,
  fetchBacklinksDomainIntersection,
  fetchBacklinksNewLostTimeseries,
  fetchBulkSpamScores,
} from "./backlinks-insights";
export {
  fetchDomainRankOverview,
  fetchKeywordIdeas,
  fetchKeywordOverview,
  fetchKeywordSuggestions,
  fetchRankedKeywords,
  fetchRelatedKeywords,
  fetchRelevantPages,
  fetchSerpCompetitors,
} from "./labs";
export {
  fetchBulkKeywordDifficulty,
  fetchBulkTrafficEstimation,
  fetchCompetitorsDomain,
  fetchDomainIntersection,
  fetchHistoricalRankOverview,
  fetchKeywordsForSite,
  fetchSearchIntent,
  fetchSubdomains,
} from "./labs-competitors";
export { fetchAdsKeywordIdeas, fetchAdsSearchVolume } from "./google-ads";
export {
  fetchClickstreamSearchVolume,
  fetchGlobalSearchVolume,
  fetchGoogleTrendsExplore,
} from "./trends";
export {
  fetchBrandMentions,
  fetchBrandMentionsSummary,
  fetchBrandMentionTrends,
} from "./content-analysis";
export { fetchDomainTechnologies, fetchDomainWhois } from "./domain-analytics";
export { fetchAiKeywordVolume } from "./ai-keyword-data";
export { fetchInstantPageAudit } from "./onpage";
export {
  fetchLiveSerp,
  fetchLocalSerp,
  fetchRankCheckSerp,
  postRankCheckTasks,
} from "./serp";
export { fetchLighthouseResult } from "./lighthouse";
export {
  fetchLlmAggregatedMetrics,
  fetchLlmCrossAggregatedMetrics,
  fetchLlmMentionsSearch,
  fetchLlmResponse,
  fetchLlmTopPages,
} from "./ai";
