/**
 * Stable per-tab slugs for the cross-tab analysis-run history.
 *
 * Shared because both halves need them: services record under a slug, and the
 * client asks to restore by the same one. Adding a tab to the history means
 * adding one entry here. Values are persisted in `analysis_runs.feature`, so
 * treat them as a storage format — rename with a migration, not in place.
 */
export const RUN_FEATURES = {
  domainOverview: "domain_overview",
  backlinks: "backlinks",
  competitors: "competitors",
  pageExplorer: "page_explorer",
  keywordResearch: "keyword_research",
  keywordTrends: "keyword_trends",
  serpOverview: "serp_overview",
  contentBrief: "content_brief",
  topicClusters: "topic_clusters",
} as const;
