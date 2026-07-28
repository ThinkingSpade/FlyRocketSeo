import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { InsightIcon } from "@/client/components/InsightTile";
import { extractPathname, StatCard } from "@/client/features/audit/shared";
import {
  exportPages,
  exportPerformance,
} from "@/client/features/audit/results/export";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import { computeLighthouseSummary } from "@/client/features/audit/results/auditDiff";
import { AuditComparison } from "@/client/features/audit/results/AuditComparison";
import { classifyAuditIssues } from "@/client/features/audit/results/auditIssues";
import {
  ExportDropdown,
  PagesTable,
  PerformanceTable,
} from "@/client/features/audit/results/ResultsTables";
import { NextStepsCard } from "@/client/features/insights/NextStepsCard";
import {
  auditRowNote,
  buildAuditVerdict,
  type AuditIssueSummary,
} from "@/client/features/insights/verdicts/audit";
import { getContentPerformance } from "@/serverFunctions/searchPerformance";

type ResultsTab = "pages" | "performance";

/** Enough top-clicked pages to judge whether a crawl issue lands on real
 *  traffic, without pulling in the whole site's page list. */
const TOP_PAGES_BY_CLICKS_LIMIT = 20;

/**
 * Top page paths by GSC clicks over the last 28 days -- free, first-party
 * data already fetched the same way for the same "top pages" concept
 * elsewhere (ContentPerformanceTab). Not connected, or connected with zero
 * clicks, both degrade to an empty list rather than an error: a missing
 * Search Console connection should make the verdict decline the
 * traffic-intersection claim, not break the tab.
 *
 * The query key matches what ContentPerformanceTab would use with no
 * device/country filter, so a warm cache from that tab means this one issues
 * no request at all.
 */
function useTopPagePathsByClicks(projectId: string): string[] {
  const query = useQuery({
    queryKey: [
      "contentPerformance",
      projectId,
      "last_28_days",
      undefined,
      undefined,
    ],
    queryFn: () =>
      getContentPerformance({
        data: { projectId, dateRange: "last_28_days" },
      }),
  });

  return useMemo(() => {
    const report = query.data;
    if (!report || !report.connected) return [];
    return report.current
      .toSorted((a, b) => b.clicks - a.clicks)
      .slice(0, TOP_PAGES_BY_CLICKS_LIMIT)
      .map((row) => extractPathname(row.page));
  }, [query.data]);
}

export function ResultsView({
  projectId,
  data,
  onTabChange,
  tab,
}: {
  projectId: string;
  data: AuditResultsData;
  tab: string;
  onTabChange: (tab: ResultsTab) => void;
}) {
  const { audit, pages, lighthouse } = data;
  const hasPerformanceTab = lighthouse.length > 0;
  const activeTab = hasPerformanceTab ? tab : "pages";
  const stats = useResultStats(pages, lighthouse);
  const { issues, pathsByIssue } = useMemo(
    () => classifyAuditIssues(pages),
    [pages],
  );
  const topPagePaths = useTopPagePathsByClicks(projectId);
  const verdict = useMemo(
    () =>
      buildAuditVerdict({
        // pages.length (rows actually available), not audit.pagesCrawled (the
        // DB counter) -- if those ever disagree, the honest read is "we could
        // not check", not "the crawl found nothing".
        pagesCrawled: pages.length,
        issues,
        topPagePaths,
        pathsByIssue,
      }),
    [pages.length, issues, topPagePaths, pathsByIssue],
  );

  return (
    <>
      <StatsGrid
        pagesCrawled={audit.pagesCrawled}
        totalPages={pages.length}
        totalLighthouse={lighthouse.length}
        averageResponseMs={stats.averageResponseMs}
        lighthouseSummary={stats.lighthouseSummary}
      />

      <AuditComparison projectId={projectId} current={data} />

      <NextStepsCard verdict={verdict} projectId={projectId} tab="Site Audit" />
      <AuditIssuesList issues={issues} />

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <ResultsHeader
            pageCount={pages.length}
            lighthouseCount={lighthouse.length}
            hasPerformanceTab={hasPerformanceTab}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onExport={(format) => {
              if (activeTab === "performance") {
                exportPerformance(lighthouse, pages, format);
                return;
              }
              exportPages(pages, format);
            }}
          />

          {activeTab === "pages" && <PagesTable pages={pages} />}
          {activeTab === "performance" && lighthouse.length > 0 && (
            <PerformanceTable
              auditId={audit.id}
              projectId={projectId}
              lighthouse={lighthouse}
              pages={pages}
            />
          )}
        </div>
      </div>
    </>
  );
}

function useResultStats(
  pages: AuditResultsData["pages"],
  lighthouse: AuditResultsData["lighthouse"],
) {
  const averageResponseMs = useMemo(() => {
    if (pages.length === 0) return 0;
    const total = pages.reduce(
      (sum: number, page: AuditResultsData["pages"][number]) =>
        sum + (page.responseTimeMs ?? 0),
      0,
    );
    return Math.round(total / pages.length);
  }, [pages]);

  const lighthouseSummary = useMemo(
    () => computeLighthouseSummary(lighthouse),
    [lighthouse],
  );

  return { averageResponseMs, lighthouseSummary };
}

/** Issue types the crawl found, most-affected first, each with its literal
 *  fix as a muted note -- absent entirely on a clean crawl. */
function AuditIssuesList({ issues }: { issues: AuditIssueSummary[] }) {
  if (issues.length === 0) return null;
  const sorted = issues.toSorted((a, b) => b.pageCount - a.pageCount);

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-2 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <InsightIcon icon={AlertTriangle} />
          Issues found
        </h3>
        <ul className="space-y-2">
          {sorted.map((issue) => {
            // Computed once per issue, rendered once below -- never called
            // twice for the same row.
            const rowNote = auditRowNote(issue.key);
            return (
              <li
                key={issue.key}
                className="flex items-baseline justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <span>{issue.label}</span>
                  {rowNote ? (
                    <p className="text-xs text-base-content/45">{rowNote}</p>
                  ) : null}
                </div>
                <span className="shrink-0 tabular-nums text-base-content/60">
                  {issue.pageCount}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ResultsHeader({
  pageCount,
  lighthouseCount,
  hasPerformanceTab,
  activeTab,
  onTabChange,
  onExport,
}: {
  pageCount: number;
  lighthouseCount: number;
  hasPerformanceTab: boolean;
  activeTab: string;
  onTabChange: (tab: ResultsTab) => void;
  onExport: (format: "csv" | "json" | "sheets") => void;
}) {
  const tabs: Array<{ tab: ResultsTab; label: string }> = [
    { tab: "pages", label: `Pages (${pageCount})` },
    { tab: "performance", label: `Performance (${lighthouseCount})` },
  ];

  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      {hasPerformanceTab ? (
        <div role="tablist" className="tabs tabs-border w-fit">
          {tabs.map(({ label, tab }) => {
            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`tab ${isActive ? "tab-active" : ""}`}
                onClick={() => onTabChange(tab)}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : (
        <h3 className="text-base font-medium">Pages ({pageCount})</h3>
      )}

      <ExportDropdown onExport={onExport} />
    </div>
  );
}

function StatsGrid({
  pagesCrawled,
  totalPages,
  totalLighthouse,
  averageResponseMs,
  lighthouseSummary,
}: {
  pagesCrawled: number;
  totalPages: number;
  totalLighthouse: number;
  averageResponseMs: number;
  lighthouseSummary: {
    failed: number;
    avgPerformance: number | null;
    avgSeo: number | null;
    avgAccessibility: number | null;
  };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Pages Crawled" value={String(pagesCrawled)} />
      <StatCard label="Total URLs" value={String(totalPages)} />
      <StatCard label="Lighthouse Tests" value={String(totalLighthouse)} />
      <StatCard label="Avg Response" value={`${averageResponseMs}ms`} />
      {totalLighthouse > 0 && (
        <>
          <StatCard
            label="Avg Lighthouse Perf"
            value={
              lighthouseSummary.avgPerformance == null
                ? "-"
                : String(lighthouseSummary.avgPerformance)
            }
            className={scoreClass(lighthouseSummary.avgPerformance)}
          />
          <StatCard
            label="Avg Lighthouse SEO"
            value={
              lighthouseSummary.avgSeo == null
                ? "-"
                : String(lighthouseSummary.avgSeo)
            }
            className={scoreClass(lighthouseSummary.avgSeo)}
          />
          <StatCard
            label="Avg Lighthouse A11y"
            value={
              lighthouseSummary.avgAccessibility == null
                ? "-"
                : String(lighthouseSummary.avgAccessibility)
            }
            className={scoreClass(lighthouseSummary.avgAccessibility)}
          />
          <StatCard
            label="Lighthouse Failures"
            value={String(lighthouseSummary.failed)}
            className={
              lighthouseSummary.failed > 0 ? "text-error" : "text-success"
            }
          />
        </>
      )}
    </div>
  );
}

function scoreClass(score: number | null) {
  if (score == null) return "";
  if (score >= 90) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-error";
}
