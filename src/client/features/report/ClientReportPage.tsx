import { useQuery } from "@tanstack/react-query";
import { FileText, Printer } from "lucide-react";
import { getProjects } from "@/serverFunctions/projects";
import {
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "@/serverFunctions/searchPerformance";
import { getLinkInsights } from "@/serverFunctions/link-insights";
import { getDomainOverview } from "@/serverFunctions/domain";
import { getBacklinksOverview } from "@/serverFunctions/backlinks";
import { getAuditHistory } from "@/serverFunctions/audit";
import { buildRecommendations } from "@/client/features/report/reportModel";
import { ReportBody } from "@/client/features/report/ReportSections";

const STALE_TIME = 10 * 60_000;

// The classic print-only-section trick: everything hides except the report, so
// the browser's Print → Save as PDF produces a clean client deliverable
// regardless of the app shell around it.
const PRINT_STYLES = `
@media print {
  body * { visibility: hidden; }
  #client-report, #client-report * { visibility: visible; }
  #client-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
  .report-no-print { display: none !important; }
  .report-section { break-inside: avoid; }
}
@page { margin: 14mm; }
`;

function daysSince(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}

export function ClientReportPage({ projectId }: { projectId: string }) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: STALE_TIME,
  });
  const project = projectsQuery.data?.find((entry) => entry.id === projectId);
  const domain = project?.domain ?? null;

  const gscQuery = useQuery({
    queryKey: ["report-gsc", projectId],
    queryFn: () => getSearchPerformanceReport({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
  const topQueriesQuery = useQuery({
    queryKey: ["report-top-queries", projectId],
    queryFn: () =>
      getSearchPerformanceTable({
        data: { projectId, dimension: "query", page: 1, pageSize: 25 },
      }),
    staleTime: STALE_TIME,
  });
  const topPagesQuery = useQuery({
    queryKey: ["report-top-pages", projectId],
    queryFn: () =>
      getSearchPerformanceTable({
        data: { projectId, dimension: "page", page: 1, pageSize: 25 },
      }),
    staleTime: STALE_TIME,
  });
  const insightsQuery = useQuery({
    queryKey: ["link-insights", projectId],
    queryFn: () => getLinkInsights({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
  const domainQuery = useQuery({
    enabled: Boolean(domain),
    queryKey: ["report-domain", projectId, domain],
    queryFn: () =>
      getDomainOverview({ data: { projectId, domain: domain ?? "" } }),
    staleTime: STALE_TIME,
  });
  const backlinksQuery = useQuery({
    enabled: Boolean(domain),
    queryKey: ["report-backlinks", projectId, domain],
    queryFn: () =>
      getBacklinksOverview({ data: { projectId, target: domain ?? "" } }),
    staleTime: STALE_TIME,
  });
  const auditsQuery = useQuery({
    queryKey: ["report-audits", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
    staleTime: STALE_TIME,
  });

  const gsc = gscQuery.data?.connected ? gscQuery.data : null;
  const insights = insightsQuery.data?.connected ? insightsQuery.data : null;
  const backlinks = backlinksQuery.data ?? null;
  const domainOverview = domainQuery.data ?? null;
  const latestAudit = (auditsQuery.data ?? []).find(
    (audit) => audit.status === "completed",
  );
  const topQueries = (
    topQueriesQuery.data?.connected ? topQueriesQuery.data.rows : []
  ).slice(0, 10);
  const topPages = (
    topPagesQuery.data?.connected ? topPagesQuery.data.rows : []
  ).slice(0, 10);

  const recommendations = buildRecommendations({
    strikingDistanceCount: gsc?.strikingDistance.length ?? 0,
    cannibalizationCount: insights?.cannibalization.length ?? 0,
    linkOpportunityCount: insights?.opportunities.length ?? 0,
    newBacklinks: backlinks?.summary.newBacklinks ?? null,
    lostBacklinks: backlinks?.summary.lostBacklinks ?? null,
    latestAuditAgeDays: daysSince(latestAudit?.startedAt),
    latestAuditFailed: latestAudit == null,
  });

  const generatedAt = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <style>{PRINT_STYLES}</style>

      <div className="report-no-print mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <FileText className="size-5" />
            Client Report
          </h1>
          <p className="text-sm text-base-content/60">
            A client-ready summary of everything this project's data says. Print
            it (or Save as PDF) and send it.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm gap-1.5"
          onClick={() => window.print()}
        >
          <Printer className="size-4" /> Print / Save PDF
        </button>
      </div>

      <div id="client-report" className="space-y-6">
        <header className="space-y-1 border-b border-base-300 pb-4">
          <p className="text-xs font-medium uppercase tracking-widest text-base-content/50">
            SEO Performance Report
          </p>
          <h1 className="text-2xl font-bold">{project?.name ?? "Project"}</h1>
          <p className="text-sm text-base-content/60">
            {domain ?? ""}
            {gsc
              ? ` · Search data ${gsc.range.startDate} – ${gsc.range.endDate}`
              : ""}{" "}
            · Generated {generatedAt}
          </p>
        </header>

        <ReportBody
          gsc={gsc}
          gscPending={gscQuery.isLoading}
          domainOverview={domainOverview}
          backlinks={backlinks}
          topQueries={topQueries}
          topPages={topPages}
          insights={insights}
          latestAudit={latestAudit ?? null}
          recommendations={recommendations}
        />

        <footer className="border-t border-base-300 pt-3 text-xs text-base-content/50">
          Prepared with FlyRocketSEO · {generatedAt}
        </footer>
      </div>
    </div>
  );
}
