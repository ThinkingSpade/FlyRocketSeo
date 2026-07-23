// Public surface of the DataForSEO integration. Internals live in the
// per-section files (labs / serp / business / backlinks / ai /
// lighthouse); everything funnels through envelope.ts (status + billing) and is
// metered in client.ts.

export { createDataforseoClient } from "@/server/lib/dataforseo/client";

// Runtime fetchers (fetchKeywordMetricsForList, fetchRankCheckTaskResult) are
// deliberately NOT re-exported here: a static re-export of an SDK-carrying leaf
// pulls the 1.6 MB dataforseo-client SDK into startup for every consumer of this
// barrel. Their callers import the leaf module lazily instead.
export { type KeywordMetricRow } from "@/server/lib/dataforseo/keyword-metrics";

export {
  type LabsKeywordDataItem,
  type DomainRankedKeywordItem,
  type RelevantPagesItem,
} from "@/server/lib/dataforseo/labs";

export { type AdsKeywordIdeaItem } from "@/server/lib/dataforseo/google-ads";

export {
  type SerpLiveItem,
  type RankCheckResult,
  type RankCheckTaskInput,
  type PostedRankCheckTask,
} from "@/server/lib/dataforseo/serp";
// SDK-free re-exports: sourced from the companion modules, not the SDK-carrying
// leaves, so importing them here never drags dataforseo-client into startup.
export { MAX_TASKS_PER_POST } from "@/server/lib/dataforseoLimits";

export type {
  BacklinksSummaryItem,
  BacklinksItem,
  ReferringDomainItem,
  DomainPageSummaryItem,
  BacklinksHistoryItem,
} from "@/server/lib/dataforseo/backlinks";
export { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";

export type { BacklinksAnchorItem } from "@/server/lib/dataforseo/backlinks-insights";

export {
  buildLlmTarget,
  CHATGPT_LANGUAGE_CODE,
  CHATGPT_LOCATION_CODE,
} from "@/server/lib/dataforseoAiTarget";
export type { LlmPlatform } from "@/server/lib/dataforseo/ai";
