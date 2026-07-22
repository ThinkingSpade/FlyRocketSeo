import { useMemo } from "react";
import { buildTechnicalIssues } from "@/client/features/opportunities/opportunityModel";
import { buildTopMovers } from "@/client/features/search-performance/contentGroups";
import {
  buildRecommendations,
  toPath,
} from "@/client/features/report/reportModel";
import {
  buildBacklinkNarrative,
  buildClickNarrative,
  buildKeywordNarrative,
  buildPerformanceNarrative,
  buildSummaryNarrative,
  buildTopPagesNarrative,
} from "@/client/features/report/reportNarrative";
import {
  ReportBreakdownCard,
  ReportCallout,
  ReportHeroStats,
  ReportNarrative,
  ReportPage,
} from "@/client/features/report/ReportChrome";
import {
  ApprovedFixesSection,
  BacklinkProfileBlock,
  ContentMovers,
  OnPageOptimizations,
} from "@/client/features/report/ReportImprovements";
import { ReportAiVisibility } from "@/client/features/report/ReportAiVisibility";
import {
  ReportBody,
  type ReportSectionKey,
} from "@/client/features/report/ReportSections";
import {
  KeywordDeepSections,
  LinkDeepSections,
} from "@/client/features/report/ReportDeepSections";
import type { useClientReportData } from "@/client/features/report/useClientReportData";

/**
 * The chaptered body of the Client Report, one topic per printed page.
 *
 * Chapters span several pages where they cover several topics (01 Performance
 * runs across four), which is what keeps each sheet to a headline, a short
 * narrative and one table rather than a wall of stacked sections.
 */
export function ReportPages({
  data,
  generatedAt,
}: {
  data: ReturnType<typeof useClientReportData>;
  generatedAt: string;
}) {
  const {
    domain,
    gsc,
    insights,
    backlinks,
    latestAudit,
    auditPages,
    topQueries,
    topPages,
  } = data;

  const technicalIssues = useMemo(
    () => buildTechnicalIssues(auditPages),
    [auditPages],
  );
  const movers = useMemo(
    () => buildTopMovers(data.currentPages, data.previousPages, 8),
    [data.currentPages, data.previousPages],
  );

  const narrativeInput = gsc
    ? {
        totals: gsc.totals,
        prevTotals: gsc.prevTotals,
        topPage: topPages[0]
          ? {
              path: toPath(topPages[0].key),
              impressions: topPages[0].impressions,
              clicks: topPages[0].clicks,
            }
          : null,
        queriesTracked: gsc.queryTotals.length,
      }
    : null;

  const positionMove = gsc
    ? gsc.prevTotals.position - gsc.totals.position
    : null;

  const recommendations = buildRecommendations({
    strikingDistanceCount: gsc?.strikingDistance.length ?? 0,
    cannibalizationCount: insights?.cannibalization.length ?? 0,
    linkOpportunityCount: insights?.opportunities.length ?? 0,
    newBacklinks: backlinks?.summary.newBacklinks ?? null,
    lostBacklinks: backlinks?.summary.lostBacklinks ?? null,
    latestAuditAgeDays: daysSince(latestAudit?.startedAt),
    latestAuditFailed: latestAudit == null,
  });

  /** Renders just the requested sections, so one chapter can span pages. */
  const sections = (only: ReportSectionKey[]) => (
    <ReportBody
      gsc={gsc}
      gscPending={data.gscPending}
      domainOverview={data.domainOverview}
      backlinks={backlinks}
      topQueries={topQueries}
      topPages={topPages}
      insights={insights}
      latestAudit={latestAudit}
      recommendations={recommendations}
      only={only}
      keywordSections={
        <KeywordDeepSections
          rankings={data.rankings}
          suggestions={data.suggestions}
        />
      }
      linkSections={
        <LinkDeepSections
          opportunities={insights?.opportunities ?? []}
          backlinkRows={data.backlinkRows}
          referringDomains={data.referringDomains}
        />
      }
    />
  );

  const chapter = { number: "01", kicker: "Performance", domain } as const;

  return (
    <>
      <ReportPage
        number="00"
        kicker="Summary"
        domain={domain}
        title="Overall summary"
        pageNumber={2}
      >
        {narrativeInput ? (
          <ReportNarrative paragraphs={buildSummaryNarrative(narrativeInput)} />
        ) : (
          <p className="text-sm text-base-content/60">
            {data.gscPending
              ? "Loading search data…"
              : "Search Console isn't connected for this project, so the narrative summary is omitted."}
          </p>
        )}
        <p className="text-xs text-base-content/50">
          Search data{" "}
          {gsc
            ? `${gsc.range.startDate} – ${gsc.range.endDate}`
            : "unavailable"}{" "}
          · Generated {generatedAt}
        </p>
      </ReportPage>

      <ReportPage {...chapter} title="Overall performance" pageNumber={3}>
        {narrativeInput ? (
          <ReportNarrative
            paragraphs={buildPerformanceNarrative(narrativeInput)}
          />
        ) : null}
        <ReportCallout>
          FlyRocketSEO read this period&apos;s Search Console data and compared
          it against the previous period to build every figure on this page.
        </ReportCallout>
        {sections(["summary"])}
      </ReportPage>

      <ReportPage {...chapter} title="Click performance" pageNumber={4}>
        {narrativeInput ? (
          <ReportNarrative paragraphs={buildClickNarrative(narrativeInput)} />
        ) : null}
        <ReportCallout>
          Every click here is someone who chose your result over the rest of the
          page — the titles and descriptions in chapter 03 are what move it.
        </ReportCallout>
      </ReportPage>

      <ReportPage {...chapter} title="Top performing pages" pageNumber={5}>
        <ReportNarrative
          paragraphs={buildTopPagesNarrative(
            topPages.map((row) => ({
              path: toPath(row.key),
              clicks: row.clicks,
              impressions: row.impressions,
            })),
          )}
        />
        {sections(["pages"])}
      </ReportPage>

      <ReportPage {...chapter} title="Keyword rankings" pageNumber={6}>
        <ReportNarrative
          paragraphs={buildKeywordNarrative(
            topQueries.map((row) => ({
              query: row.key,
              clicks: row.clicks,
              impressions: row.impressions,
            })),
            positionMove,
          )}
        />
        {sections(["queries"])}
      </ReportPage>

      <ReportPage
        number="02"
        kicker="Content"
        domain={domain}
        title="Pages gaining ground"
        pageNumber={7}
      >
        <ContentMovers rows={movers} />
      </ReportPage>

      <ReportPage
        number="03"
        kicker="Improvements"
        domain={domain}
        title={
          data.approvedFixes.length > 0
            ? "On-page optimizations approved"
            : "On-page optimizations"
        }
        pageNumber={8}
      >
        {data.approvedFixes.length > 0 ? (
          <>
            <ApprovedFixesSection fixes={data.approvedFixes} />
            <ReportCallout>
              These rewrites were generated from your crawl and Search Console
              data, then approved by you — ready to publish.
            </ReportCallout>
          </>
        ) : null}
        <OnPageOptimizations
          issues={technicalIssues}
          pagesCrawled={latestAudit?.pagesCrawled ?? null}
          pagesAnalyzed={auditPages.length}
        />
      </ReportPage>

      <ReportPage
        number="03"
        kicker="Improvements"
        domain={domain}
        title="Site health"
        pageNumber={9}
      >
        {sections(["siteHealth"])}
      </ReportPage>

      <ReportPage
        number="04"
        kicker="Opportunities"
        domain={domain}
        title="Backlink profile"
        pageNumber={10}
      >
        {backlinks ? (
          <>
            <ReportHeroStats
              items={[
                {
                  label: "Domain Rank",
                  value: backlinks.summary.rank?.toLocaleString("en-US") ?? "—",
                },
                {
                  label: "Total Backlinks",
                  value:
                    backlinks.summary.backlinks?.toLocaleString("en-US") ?? "—",
                },
              ]}
            />
            <ReportNarrative
              paragraphs={buildBacklinkNarrative({
                rank: backlinks.summary.rank,
                backlinks: backlinks.summary.backlinks,
                referringDomains: backlinks.summary.referringDomains,
                spamScore: backlinks.summary.backlinksSpamScore,
                brokenBacklinks: backlinks.summary.brokenBacklinks,
              })}
            />
            <BacklinkProfileBlock
              profile={backlinks.summary}
              topDomains={data.referringDomains.map((row) => ({
                domain: row.domain,
                backlinks: row.backlinks,
              }))}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReportBreakdownCard
                title="Top countries"
                rows={backlinks.summary.referringCountries}
              />
              <ReportBreakdownCard
                title="Link types"
                rows={backlinks.summary.referringLinkTypes}
              />
            </div>
            {sections(["linkProfile", "linkDeep"])}
          </>
        ) : (
          <p className="text-sm text-base-content/60">
            Run a backlink analysis for this domain to include the link profile
            in this report.
          </p>
        )}
      </ReportPage>

      <ReportPage
        number="04"
        kicker="Opportunities"
        domain={domain}
        title="Quick wins & keyword conflicts"
        pageNumber={11}
      >
        {sections(["strikingDistance", "conflicts", "keywordDeep"])}
      </ReportPage>

      <ReportPage
        number="05"
        kicker="AI Visibility"
        domain={domain}
        title="AI search visibility"
        pageNumber={12}
      >
        <ReportAiVisibility visibility={data.brandVisibility} />
      </ReportPage>

      <ReportPage
        number="06"
        kicker="Next steps"
        domain={domain}
        title="What we'd do next"
        pageNumber={13}
      >
        <ul className="list-inside list-disc space-y-1.5 text-[15px] leading-relaxed text-base-content/80">
          {recommendations.map((recommendation) => (
            <li key={recommendation}>{recommendation}</li>
          ))}
        </ul>
      </ReportPage>
    </>
  );
}

function daysSince(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}
