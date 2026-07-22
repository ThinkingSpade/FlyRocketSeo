import { useMemo, useState } from "react";
import { ReportToolbar } from "@/client/features/report/ReportToolbar";
import { buildTechnicalIssues } from "@/client/features/opportunities/opportunityModel";
import { buildTopMovers } from "@/client/features/search-performance/contentGroups";
import { buildRecommendations } from "@/client/features/report/reportModel";
import {
  buildBacklinkNarrative,
  buildClickNarrative,
  buildKeywordNarrative,
  buildPerformanceNarrative,
  buildSummaryNarrative,
  buildTopPagesNarrative,
} from "@/client/features/report/reportNarrative";
import {
  ReportCallout,
  ReportCover,
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
import { ReportBody } from "@/client/features/report/ReportSections";
import {
  KeywordDeepSections,
  LinkDeepSections,
} from "@/client/features/report/ReportDeepSections";
import { useClientReportData } from "@/client/features/report/useClientReportData";
import { toPath } from "@/client/features/report/reportModel";

// The classic print-only-section trick: everything hides except the report, so
// the browser's Print → Save as PDF produces a clean client deliverable
// regardless of the app shell around it. Chapters start on their own page.
const PRINT_STYLES = `
/* Table styling is applied at the report root so every existing section picks
   it up without each one re-implementing the look. */
#client-report table { width: 100%; border-collapse: collapse; }
#client-report thead tr { background: #4934c7; }
#client-report thead th {
  padding: 10px 12px; text-align: left; color: #ffffff;
  font-size: 12.5px; font-weight: 600; letter-spacing: 0.01em;
}
#client-report tbody td {
  padding: 9px 12px; font-size: 12.5px; color: #2f2b52;
  border-bottom: 1px solid #ece9f8;
}
#client-report tbody tr:nth-child(even) { background: #f7f6fd; }
#client-report .report-page:first-of-type { break-before: auto; }

@media print {
  body * { visibility: hidden; }
  #client-report, #client-report * { visibility: visible; }
  #client-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
  .report-no-print { display: none !important; }
  .report-section { break-inside: avoid; }
  /* One topic per sheet, mirroring how a chaptered report paginates. */
  .report-page { break-before: page; }
  .report-cover { break-after: page; }
}
/* Colour bands and tinted rows must survive the print pipeline — Chrome drops
   backgrounds otherwise, which would flatten the whole design to white. */
#client-report { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { margin: 0; }
`;

const PREPARED_BY_KEY = "flyrocket:report:preparedBy";
const AGENCY_KEY = "flyrocket:report:agency";

function readStored(key: string): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(key) ?? "";
}

function daysSince(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}

export function ClientReportPage({ projectId }: { projectId: string }) {
  const data = useClientReportData(projectId);
  const [preparedBy, setPreparedBy] = useState(() =>
    readStored(PREPARED_BY_KEY),
  );
  const [agency, setAgency] = useState(() => readStored(AGENCY_KEY));

  const {
    project,
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

  const now = new Date();
  const generatedAt = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const periodLabel = now
    .toLocaleDateString(undefined, { month: "short", year: "numeric" })
    .toUpperCase();

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <style>{PRINT_STYLES}</style>

      <ReportToolbar
        preparedBy={preparedBy}
        agency={agency}
        onPreparedByChange={(value) => {
          setPreparedBy(value);
          localStorage.setItem(PREPARED_BY_KEY, value);
        }}
        onAgencyChange={(value) => {
          setAgency(value);
          localStorage.setItem(AGENCY_KEY, value);
        }}
      />

      <div id="client-report" className="space-y-8">
        <ReportCover
          projectName={project?.name ?? "Project"}
          domain={domain}
          periodLabel={periodLabel}
          preparedBy={preparedBy}
          agency={agency}
        />

        <ReportPage
          number="00"
          kicker="Summary"
          domain={domain}
          title="Overall summary"
          pageNumber={2}
        >
          {narrativeInput ? (
            <ReportNarrative
              paragraphs={buildSummaryNarrative(narrativeInput)}
            />
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

        <ReportPage
          number="01"
          kicker="Performance"
          domain={domain}
          title="Overall performance"
          pageNumber={3}
        >
          {narrativeInput ? (
            <>
              <ReportNarrative
                paragraphs={buildPerformanceNarrative(narrativeInput)}
              />
              <ReportCallout>
                FlyRocketSEO read this period&apos;s Search Console data and
                compared it against the previous period to build every figure on
                this page.
              </ReportCallout>
              <ReportNarrative
                paragraphs={buildClickNarrative(narrativeInput)}
              />
            </>
          ) : null}
        </ReportPage>

        <ReportPage
          number="01"
          kicker="Performance"
          domain={domain}
          title="Top pages & keyword rankings"
          pageNumber={4}
        >
          <ReportNarrative
            paragraphs={buildTopPagesNarrative(
              topPages.map((row) => ({
                path: toPath(row.key),
                clicks: row.clicks,
                impressions: row.impressions,
              })),
            )}
          />
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

          {/* Everything the report already carried, unchanged. */}
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
        </ReportPage>

        <ReportPage
          number="02"
          kicker="Content"
          domain={domain}
          title="Pages gaining ground"
          pageNumber={5}
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
          pageNumber={6}
        >
          {data.approvedFixes.length > 0 ? (
            <>
              <ApprovedFixesSection fixes={data.approvedFixes} />
              <ReportCallout>
                These rewrites were generated from your crawl and Search Console
                data, then approved by you — ready to publish.
              </ReportCallout>
              <h3 className="pt-2 text-base font-semibold">
                Still recommended
              </h3>
            </>
          ) : null}
          <OnPageOptimizations
            issues={technicalIssues}
            pagesCrawled={latestAudit?.pagesCrawled ?? null}
          />
        </ReportPage>

        <ReportPage
          number="04"
          kicker="Opportunities"
          domain={domain}
          title="Backlink profile"
          pageNumber={7}
        >
          {backlinks ? (
            <>
              <ReportHeroStats
                items={[
                  {
                    label: "Domain Rank",
                    value:
                      backlinks.summary.rank?.toLocaleString("en-US") ?? "—",
                  },
                  {
                    label: "Total Backlinks",
                    value:
                      backlinks.summary.backlinks?.toLocaleString("en-US") ??
                      "—",
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
            </>
          ) : (
            <p className="text-sm text-base-content/60">
              Run a backlink analysis for this domain to include the link
              profile in this report.
            </p>
          )}
        </ReportPage>

        <ReportPage
          number="05"
          kicker="AI Visibility"
          domain={domain}
          title="AI search visibility"
          pageNumber={8}
        >
          <ReportAiVisibility visibility={data.brandVisibility} />
        </ReportPage>

        <ReportPage
          number="06"
          kicker="Next steps"
          domain={domain}
          title="What we'd do next"
          pageNumber={9}
        >
          <ul className="list-inside list-disc space-y-1.5 text-[15px] leading-relaxed text-base-content/80">
            {recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </ReportPage>

        <footer className="border-t border-base-300 pt-3 text-xs text-base-content/50">
          Prepared with FlyRocketSEO · {generatedAt}
          {agency ? ` · ${agency}` : ""}
        </footer>
      </div>
    </div>
  );
}
