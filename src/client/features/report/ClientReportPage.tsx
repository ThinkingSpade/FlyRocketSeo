import { useMemo, useState } from "react";
import { FileText, Printer } from "lucide-react";
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
  ReportChapter,
  ReportCover,
  ReportNarrative,
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
@media print {
  body * { visibility: hidden; }
  #client-report, #client-report * { visibility: visible; }
  #client-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
  .report-no-print { display: none !important; }
  .report-section { break-inside: avoid; }
  .report-chapter { break-before: page; }
  .report-cover { break-after: page; }
}
@page { margin: 14mm; }
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

      <div className="report-no-print mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <FileText className="size-5" />
            Client Report
          </h1>
          <p className="text-sm text-base-content/60">
            A client-ready summary of everything this project&apos;s data says.
            Print it (or Save as PDF) and send it.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="form-control">
            <span className="label-text text-xs text-base-content/60">
              Prepared by
            </span>
            <input
              className="input input-bordered input-sm w-40"
              value={preparedBy}
              placeholder="Your name"
              onChange={(event) => {
                setPreparedBy(event.target.value);
                localStorage.setItem(PREPARED_BY_KEY, event.target.value);
              }}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs text-base-content/60">
              Agency
            </span>
            <input
              className="input input-bordered input-sm w-40"
              value={agency}
              placeholder="Company name"
              onChange={(event) => {
                setAgency(event.target.value);
                localStorage.setItem(AGENCY_KEY, event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1.5"
            onClick={() => window.print()}
          >
            <Printer className="size-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      <div id="client-report" className="space-y-8">
        <ReportCover
          projectName={project?.name ?? "Project"}
          domain={domain}
          periodLabel={periodLabel}
          preparedBy={preparedBy}
          agency={agency}
        />

        <ReportChapter number="00" kicker="Summary" domain={domain}>
          <h2 className="text-lg font-semibold">Overall summary</h2>
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
        </ReportChapter>

        <ReportChapter number="01" kicker="Performance" domain={domain}>
          {narrativeInput ? (
            <>
              <h2 className="text-lg font-semibold">Overall performance</h2>
              <ReportNarrative
                paragraphs={buildPerformanceNarrative(narrativeInput)}
              />
              <h3 className="pt-2 text-base font-semibold">
                Click performance
              </h3>
              <ReportNarrative
                paragraphs={buildClickNarrative(narrativeInput)}
              />
            </>
          ) : null}
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
        </ReportChapter>

        <ReportChapter number="02" kicker="Content" domain={domain}>
          <h2 className="text-lg font-semibold">Pages gaining ground</h2>
          <ContentMovers rows={movers} />
        </ReportChapter>

        <ReportChapter number="03" kicker="Improvements" domain={domain}>
          {data.approvedFixes.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold">On-page optimizations done</h2>
              <ApprovedFixesSection fixes={data.approvedFixes} />
              <h3 className="pt-2 text-base font-semibold">
                Still recommended
              </h3>
            </>
          ) : (
            <h2 className="text-lg font-semibold">On-page optimizations</h2>
          )}
          <OnPageOptimizations
            issues={technicalIssues}
            pagesCrawled={latestAudit?.pagesCrawled ?? null}
          />
        </ReportChapter>

        <ReportChapter number="04" kicker="Opportunities" domain={domain}>
          <h2 className="text-lg font-semibold">Backlink profile</h2>
          {backlinks ? (
            <>
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
        </ReportChapter>

        <ReportChapter number="05" kicker="AI Visibility" domain={domain}>
          <h2 className="text-lg font-semibold">AI search visibility</h2>
          <ReportAiVisibility visibility={data.brandVisibility} />
        </ReportChapter>

        <ReportChapter number="06" kicker="Next steps" domain={domain}>
          <h2 className="text-lg font-semibold">What we&apos;d do next</h2>
          <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-base-content/80">
            {recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </ReportChapter>

        <footer className="border-t border-base-300 pt-3 text-xs text-base-content/50">
          Prepared with FlyRocketSEO · {generatedAt}
          {agency ? ` · ${agency}` : ""}
        </footer>
      </div>
    </div>
  );
}
