import { buildBacklinkNarrative } from "@/client/features/report/reportNarrative";
import {
  ReportBreakdownCard,
  ReportCallout,
  ReportHeroStats,
  ReportNarrative,
} from "@/client/features/report/ReportChrome";
import {
  ApprovedFixesSection,
  BacklinkProfileBlock,
  OnPageOptimizations,
} from "@/client/features/report/ReportImprovements";
import { ReportAiVisibility } from "@/client/features/report/ReportAiVisibility";
import { describeOnPageStatus } from "@/client/features/report/onPageStatus";
import {
  CHAPTER_BODY,
  NO_GSC,
  type ChapterCollector,
  type ChapterInput,
} from "@/client/features/report/reportChapters";

/**
 * Chapters 03–06: the crawl, the link profile, AI visibility and next steps.
 *
 * Split from `reportChapters` only for size — the inclusion rule is the same
 * one documented there: a finding earns its sheet, an absence becomes a line
 * on the summary page's coverage list.
 */

const NO_AUDIT = "No site audit has completed for this project yet.";
// These two name the button rather than the analysis: both sit behind the
// metered requests on the toolbar above the report, so "not run yet" is
// something the agency can fix in one click before sending the PDF.
const NO_LINK_DETAIL =
  "The metered backlink detail request has not been run for this domain.";
const NO_KEYWORD_DETAIL =
  "The metered keyword detail request has not been run for this domain.";

export function buildSiteChapters(
  input: ChapterInput,
  out: ChapterCollector,
): void {
  buildImprovementChapters(input, out);
  buildOpportunityChapters(input, out);

  // Always present: buildRecommendations never returns an empty list, and the
  // sentence it falls back to is itself the finding.
  out.add({
    key: "next",
    number: "06",
    kicker: "Next steps",
    title: "What we'd do next",
    body: (
      <ul
        className="list-outside list-disc space-y-2 pl-5 text-[15px] leading-relaxed"
        style={{ color: CHAPTER_BODY }}
      >
        {input.recommendations.map((recommendation) => (
          <li key={recommendation}>{recommendation}</li>
        ))}
      </ul>
    ),
  });
}

/** Chapter 03: what the crawl found, and what was approved off the back of it. */
function buildImprovementChapters(
  { data, sections, technicalIssues }: ChapterInput,
  out: ChapterCollector,
): void {
  const { latestAudit, auditPages, approvedFixes } = data;
  const pagesCrawled = latestAudit?.pagesCrawled ?? null;
  const status = describeOnPageStatus({
    pagesCrawled,
    pagesAnalyzed: auditPages.length,
    issuesFound: technicalIssues.filter((issue) => issue.pageCount > 0).length,
  });

  if (approvedFixes.length > 0 || status === "issues" || status === "clean") {
    out.add({
      key: "on-page",
      number: "03",
      kicker: "Improvements",
      title:
        approvedFixes.length > 0
          ? "On-page optimizations approved"
          : "On-page optimizations",
      body: (
        <>
          {approvedFixes.length > 0 ? (
            <>
              <ApprovedFixesSection fixes={approvedFixes} />
              <ReportCallout>
                These rewrites were generated from your crawl and Search Console
                data, then approved by you — ready to publish.
              </ReportCallout>
            </>
          ) : null}
          <OnPageOptimizations
            issues={technicalIssues}
            pagesCrawled={pagesCrawled}
            pagesAnalyzed={auditPages.length}
          />
        </>
      ),
    });
  } else {
    out.drop(
      "On-page optimizations",
      status === "no-audit"
        ? NO_AUDIT
        : "The last audit's page details could not be loaded, so on-page issues could not be checked.",
    );
  }

  if (latestAudit) {
    out.add({
      key: "site-health",
      number: "03",
      kicker: "Improvements",
      title: "Site health",
      body: sections(["siteHealth"]),
    });
  } else {
    out.drop("Site health", NO_AUDIT);
  }
}

/** Chapters 04–05: the link profile, the quick wins, and AI visibility. */
function buildOpportunityChapters(
  { data, sections }: ChapterInput,
  out: ChapterCollector,
): void {
  const { gsc, insights, backlinks } = data;

  if (backlinks) {
    const summary = backlinks.summary;
    out.add({
      key: "backlinks",
      number: "04",
      kicker: "Opportunities",
      title: "Backlink profile",
      body: (
        <>
          <ReportHeroStats
            items={[
              {
                label: "Domain authority",
                value:
                  summary.rank == null
                    ? "—"
                    : `${summary.rank.toLocaleString("en-US")}/100`,
              },
              {
                label: "Total Backlinks",
                value: summary.backlinks?.toLocaleString("en-US") ?? "—",
              },
            ]}
          />
          <ReportNarrative
            paragraphs={buildBacklinkNarrative({
              rank: summary.rank,
              backlinks: summary.backlinks,
              referringDomains: summary.referringDomains,
              spamScore: summary.backlinksSpamScore,
              brokenBacklinks: summary.brokenBacklinks,
            })}
          />
          <BacklinkProfileBlock
            profile={summary}
            topDomains={data.referringDomains.map((row) => ({
              domain: row.domain,
              backlinks: row.backlinks,
            }))}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ReportBreakdownCard
              title="Top countries"
              rows={summary.referringCountries}
            />
            <ReportBreakdownCard
              title="Top domains"
              rows={summary.referringTlds}
            />
            <ReportBreakdownCard
              title="Link types"
              rows={summary.referringLinkTypes}
            />
          </div>
          {sections(["linkProfile"])}
        </>
      ),
    });
  } else {
    out.drop(
      "Backlink profile",
      "No backlink analysis has been saved for this domain.",
    );
  }

  // The link and keyword deep dives get their own sheets rather than riding
  // along on the pages above. Each holds three tables of up to ten rows, which
  // is more than a sheet on its own — stacked, they overflowed onto
  // continuation sheets that carry no chapter band and no folio.
  if (
    insights?.opportunities.length ||
    data.backlinkRows.length > 0 ||
    data.referringDomains.length > 0
  ) {
    out.add({
      key: "link-detail",
      number: "04",
      kicker: "Opportunities",
      title: "Where the links come from",
      body: sections(["linkDeep"]),
    });
  } else if (backlinks) {
    out.drop("Where the links come from", NO_LINK_DETAIL);
  }

  const hasQuickWins =
    (gsc?.strikingDistance.length ?? 0) > 0 ||
    (insights?.cannibalization.length ?? 0) > 0;
  if (hasQuickWins) {
    out.add({
      key: "quick-wins",
      number: "04",
      kicker: "Opportunities",
      title: "Quick wins & keyword conflicts",
      body: sections(["strikingDistance", "conflicts"]),
    });
  } else if (!data.gscPending && !data.insightsPending) {
    out.drop(
      "Quick wins & keyword conflicts",
      gsc
        ? "No striking-distance keywords or keyword conflicts were found this period."
        : NO_GSC,
    );
  }

  if (data.rankings.length > 0 || data.suggestions.length > 0) {
    out.add({
      key: "keyword-detail",
      number: "04",
      kicker: "Opportunities",
      title: "Keyword detail",
      body: sections(["keywordDeep"]),
    });
  } else {
    out.drop("Keyword detail", NO_KEYWORD_DETAIL);
  }

  if (data.brandVisibility?.latestResult?.hasData) {
    out.add({
      key: "ai",
      number: "05",
      kicker: "AI Visibility",
      title: "AI search visibility",
      body: <ReportAiVisibility visibility={data.brandVisibility} />,
    });
  } else {
    out.drop(
      "AI search visibility",
      "No AI brand analysis has been run for this project.",
    );
  }
}
