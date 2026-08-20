import {
  buildcitationsChapter,
  usecitationsReportData,
} from "@/client/features/report/chapters/citations";
import {
  buildcompetitorsChapter,
  usecompetitorsReportData,
} from "@/client/features/report/chapters/competitors";
import {
  buildkeywordTrendsChapter,
  usekeywordTrendsReportData,
} from "@/client/features/report/chapters/keywordTrends";
import {
  buildlocalSeoChapter,
  uselocalSeoReportData,
} from "@/client/features/report/chapters/localSeo";
import {
  buildrankTrackingChapter,
  userankTrackingReportData,
} from "@/client/features/report/chapters/rankTracking";
import {
  buildsavedKeywordsChapter,
  usesavedKeywordsReportData,
} from "@/client/features/report/chapters/savedKeywords";
import {
  buildserpOverviewChapter,
  useserpOverviewReportData,
} from "@/client/features/report/chapters/serpOverview";
import {
  buildtopicClustersChapter,
  usetopicClustersReportData,
} from "@/client/features/report/chapters/topicClusters";
import type { ChapterCollector } from "@/client/features/report/reportChapters";

/**
 * The eight feature chapters, read in one hook and built in one call.
 *
 * These features used to appear in the report only as names on the "not
 * covered" line — an agency that tracked rankings every week for a month
 * handed the client a PDF with no trace of that work. Each module here owns
 * one feature's reads and one feature's sheet; this file is only the seam, so
 * that wiring a ninth is an import and two lines rather than surgery on the
 * report page.
 *
 * Every read below restores an already-paid-for run or reads stored rows, so
 * opening the report costs nothing. Nothing here may become a metered call
 * without the toolbar's explicit-button treatment — the report renders on
 * mount, and a chapter that spends money on mount spends it unasked.
 */
export function useReportChapterData(projectId: string) {
  return {
    keywordTrends: usekeywordTrendsReportData(projectId),
    topicClusters: usetopicClustersReportData(projectId),
    competitors: usecompetitorsReportData(projectId),
    savedKeywords: usesavedKeywordsReportData(projectId),
    serpOverview: useserpOverviewReportData(projectId),
    rankTracking: userankTrackingReportData(projectId),
    localSeo: uselocalSeoReportData(projectId),
    citations: usecitationsReportData(projectId),
  };
}

export type ReportChapterData = ReturnType<typeof useReportChapterData>;

/**
 * Builds all eight, in printed-band order.
 *
 * Each builder either adds its sheet or drops a named line with the reason,
 * so a feature can never leave the report silently: the caller's coverage list
 * gets "Rank Tracking — no tracker is configured for this project" rather than
 * nothing at all.
 */
export function buildFeatureChapters(
  data: ReportChapterData,
  out: ChapterCollector,
): void {
  buildkeywordTrendsChapter(data.keywordTrends, out);
  buildtopicClustersChapter(data.topicClusters, out);
  buildcompetitorsChapter(data.competitors, out);
  buildsavedKeywordsChapter(data.savedKeywords, out);
  buildserpOverviewChapter(data.serpOverview, out);
  buildrankTrackingChapter(data.rankTracking, out);
  buildlocalSeoChapter(data.localSeo, out);
  buildcitationsChapter(data.citations, out);
}
