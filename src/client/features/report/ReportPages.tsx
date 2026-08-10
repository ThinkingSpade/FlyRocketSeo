import { useMemo, type ReactNode } from "react";
import { buildTechnicalIssues } from "@/client/features/opportunities/opportunityModel";
import { buildTopMovers } from "@/client/features/search-performance/contentGroups";
import {
  buildRecommendations,
  toPath,
} from "@/client/features/report/reportModel";
import { buildSummaryNarrative } from "@/client/features/report/reportNarrative";
import {
  ReportNarrative,
  ReportPage,
} from "@/client/features/report/ReportChrome";
import { ReportCoverage } from "@/client/features/report/ReportCoverage";
import { buildReportChapters } from "@/client/features/report/reportChapters";
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
 * This file owns the front matter and the pagination; `reportChapters` decides
 * which chapters have earned a sheet. Page numbers are derived from that list
 * rather than written by hand — they were hard-coded 2–13, which was only ever
 * correct while every chapter printed unconditionally.
 */

const MUTED = "#5c6a7d"; // matches ReportChrome's secondary type

export function ReportPages({
  data,
  generatedAt,
  foot,
}: {
  data: ReturnType<typeof useClientReportData>;
  generatedAt: string;
  foot: string;
}) {
  const { domain, gsc, insights, backlinks, latestAudit, auditPages } = data;

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
        topPage: data.topPages[0]
          ? {
              path: toPath(data.topPages[0].key),
              impressions: data.topPages[0].impressions,
              clicks: data.topPages[0].clicks,
            }
          : null,
        queriesTracked: gsc.queryTotals.length,
      }
    : null;

  const recommendations = buildRecommendations({
    strikingDistanceCount: gsc?.strikingDistance.length ?? 0,
    cannibalizationCount: insights?.cannibalization.length ?? 0,
    linkOpportunityCount: insights?.opportunities.length ?? 0,
    newBacklinks: backlinks?.summary.newBacklinks ?? null,
    lostBacklinks: backlinks?.summary.lostBacklinks ?? null,
    latestAuditAgeDays: daysSince(latestAudit?.startedAt),
    latestAuditFailed: latestAudit == null,
    // MISSING counts as incomplete, not as "nothing found". A failed or
    // disconnected GSC request leaves `gsc`/`insights` null, their counts fall
    // to zero, and every recommendation branch above goes quiet -- which
    // previously produced a confident all-clear built on data we never received.
    //
    // But PENDING is excluded. Loading also leaves them null, and this page can
    // be printed mid-load: saying "that data was incomplete" about a request
    // still in flight is its own false claim, frozen into a PDF. While loading,
    // neither sentence is emitted.
    gscPending: data.gscPending || data.insightsPending,
    gscIncomplete:
      !data.gscPending &&
      !data.insightsPending &&
      (gsc == null ||
        insights == null ||
        gsc.sampling.queryPages.truncated ||
        insights.truncated),
  });

  /** Renders just the requested sections, so one chapter can span pages. */
  const sections = (only: ReportSectionKey[]): ReactNode => (
    <ReportBody
      gsc={gsc}
      gscPending={data.gscPending}
      domainOverview={data.domainOverview}
      backlinks={backlinks}
      topQueries={data.topQueries}
      topPages={data.topPages}
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

  const { pages, omissions } = buildReportChapters({
    data,
    sections,
    narrativeInput,
    positionMove: gsc ? gsc.prevTotals.position - gsc.totals.position : null,
    movers,
    technicalIssues,
    recommendations,
  });

  return (
    <>
      <ReportPage
        number="00"
        kicker="Summary"
        domain={domain}
        title="Overall summary"
        foot={foot}
      >
        {narrativeInput ? (
          <ReportNarrative paragraphs={buildSummaryNarrative(narrativeInput)} />
        ) : (
          <p className="text-[15px] leading-relaxed" style={{ color: MUTED }}>
            {data.gscPending
              ? "Loading search data…"
              : "Search Console isn't connected for this project, so the narrative summary is omitted."}
          </p>
        )}
        <p className="text-xs" style={{ color: MUTED }}>
          Search data{" "}
          {gsc
            ? `${gsc.range.startDate} – ${gsc.range.endDate}`
            : "unavailable"}{" "}
          · Generated {generatedAt}
        </p>
        <ReportCoverage included={pages.length} omissions={omissions} />
      </ReportPage>

      {pages.map((spec) => (
        <ReportPage
          key={spec.key}
          number={spec.number}
          kicker={spec.kicker}
          domain={domain}
          title={spec.title}
          foot={foot}
        >
          {spec.body}
        </ReportPage>
      ))}
    </>
  );
}

function daysSince(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}
