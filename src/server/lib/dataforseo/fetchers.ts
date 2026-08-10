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
  fetchBulkBacklinks,
  fetchBulkNewLostReferringDomains,
  fetchBulkRanks,
  fetchBulkReferringDomains,
  fetchReferringNetworks,
} from "./backlinks-bulk";
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
  // Aliased: "./labs" (above) already exports a DIFFERENT, older
  // fetchSerpCompetitors (bare SerpCompetitorItem[], no totalCount, used by
  // client.ts's `labs.serpCompetitors`). A same-name re-export here would
  // collide with it, so client.ts's `competitors.serpCompetitors` reaches
  // this one -- the {items, totalCount} shape rankSerpCompetitors/getCompetitors
  // depend on -- through this alias instead.
  fetchSerpCompetitors as fetchSerpCompetitorsPage,
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
