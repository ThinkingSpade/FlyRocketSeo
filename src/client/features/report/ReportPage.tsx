import { Copy, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  computeAveragePositions,
  computeMovers,
  REPORT_RANGE_KEYS,
  REPORT_RANGES,
  reportDevice,
  type ReportRangeKey,
} from "./reportData";
import {
  reportToMarkdown,
  type ReportRankBlockSnapshot,
} from "./reportMarkdown";
import { computeScorecards } from "@/client/features/rank-tracking/rankTrackingScorecards";
import { ReportRankBlock } from "./ReportRankBlock";
import {
  ReportAuditSection,
  ReportEventsSection,
  ReportGscSection,
} from "./ReportSections";
import { ReportSection, SectionNote } from "./ReportPrimitives";
import { useReportData } from "./useReportData";

type ReportNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

/**
 * The client-ready report: a printable document assembling rank performance,
 * search console totals, the work log, and site health for one project.
 * Print styles live on the sheet itself; the app shell hides its chrome via
 * `print:hidden` so File → Print (or the button below) yields a clean PDF.
 */
export function ReportPage({
  projectId,
  navigate,
  rangeKey,
}: {
  projectId: string;
  navigate: ReportNavigate;
  rangeKey: ReportRangeKey;
}) {
  const data = useReportData(projectId, rangeKey);
  const { range, project } = data;

  const generatedAt = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const handleCopyMarkdown = () => {
    const rankBlocks: ReportRankBlockSnapshot[] = data.configs.flatMap(
      (config, index) => {
        const rows = data.resultsQueries[index]?.data?.rows;
        if (!rows || rows.length === 0) return [];
        const device = reportDevice(config.devices);
        const cards = computeScorecards(rows, device);
        const averages = computeAveragePositions(rows, device);
        return [
          {
            domain: config.domain,
            device,
            keywordCount: config.keywordCount,
            visibility: cards.visibility,
            visibilityDelta: cards.visibilityDelta,
            ranking: cards.ranking,
            rankingDelta: cards.rankingDelta,
            top3: cards.top3,
            top10: cards.top10,
            improved: cards.improved,
            declined: cards.declined,
            avgPosition: averages.current,
            avgPositionPrevious: averages.previous,
            movers: computeMovers(rows, device),
          },
        ];
      },
    );

    const markdown = reportToMarkdown({
      projectName: project?.name ?? "Project",
      projectDomain: project?.domain ?? null,
      rangeLabel: range.label,
      generatedAt,
      rankBlocks,
      events: data.eventsInRange,
      audit:
        data.latestCompletedAudit && data.auditHealth
          ? {
              completedAt: data.latestCompletedAudit.completedAt,
              health: data.auditHealth,
            }
          : null,
      gsc: data.gsc,
    });

    void navigator.clipboard.writeText(markdown);
    captureClientEvent("report:copy_markdown");
    toast.success("Report copied as Markdown");
  };

  const handlePrint = () => {
    captureClientEvent("report:print");
    window.print();
  };

  const setRange = (nextRange: ReportRangeKey) => {
    navigate({
      search: (previous) => ({ ...previous, range: nextRange }),
      replace: true,
    });
  };

  const hasAnyRankData = data.resultsQueries.some(
    (query) => (query.data?.rows.length ?? 0) > 0,
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 print:block print:max-w-none print:p-0">
      {/* Screen-only toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <FileText className="size-5" />
            Client Report
          </h1>
          <p className="text-sm text-base-content/60">
            A client-ready summary of this project — print it, save it as PDF,
            or copy it for your AI agent.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="join">
            {REPORT_RANGE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`btn btn-xs join-item ${
                  rangeKey === key ? "btn-active" : "btn-ghost"
                }`}
                onClick={() => setRange(key)}
              >
                {REPORT_RANGES[key].label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-sm gap-1.5"
            onClick={handleCopyMarkdown}
          >
            <Copy className="size-3.5" />
            Copy for AI
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1.5"
            onClick={handlePrint}
          >
            <Printer className="size-3.5" />
            Download PDF
          </button>
        </div>
      </div>

      {/* The printable sheet. Always light: it's a document, and it must not
          print near-white text when the app is in dark mode. */}
      <div
        data-theme="light"
        className="space-y-6 rounded-xl border border-base-300 bg-base-100 p-6 text-base-content shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
      >
        <style>{`@media print { @page { margin: 14mm; } }`}</style>

        <header className="border-b border-base-300 pb-4">
          <p className="text-[11px] uppercase tracking-widest text-base-content/50">
            SEO Report
          </p>
          <h2 className="text-2xl font-bold">
            {data.projectPending
              ? "…"
              : (project?.domain ?? project?.name ?? "Project")}
          </h2>
          <p className="pt-1 text-xs text-base-content/60">
            {range.label} · Generated {generatedAt}
          </p>
        </header>

        <ReportSection
          title="Rank performance"
          subtitle={`Google positions for tracked keywords, compared to ${range.label.toLowerCase().replace("last", "the previous")}`}
        >
          {data.configsError ? (
            <SectionNote>
              Rank tracking data could not be loaded for this report.
            </SectionNote>
          ) : data.configsPending ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-4 animate-spin text-base-content/50" />
            </div>
          ) : data.configs.length === 0 ? (
            <SectionNote>
              No domains are rank-tracked yet. Set up Rank Tracking to fill this
              section.
            </SectionNote>
          ) : (
            <div className="space-y-8">
              {data.configs.map((config, index) => (
                <ReportRankBlock
                  key={config.id}
                  domain={config.domain}
                  device={reportDevice(config.devices)}
                  keywordCount={config.keywordCount}
                  rows={data.resultsQueries[index]?.data?.rows}
                  rowsPending={data.resultsQueries[index]?.isPending ?? true}
                  rowsError={data.resultsQueries[index]?.isError ?? false}
                  trend={data.trendQueries[index]?.data}
                  events={data.allEvents}
                />
              ))}
            </div>
          )}
        </ReportSection>

        {data.gsc ? <ReportGscSection gsc={data.gsc} /> : null}

        <ReportEventsSection
          events={data.eventsInRange}
          rangeLabel={range.label}
        />

        {data.auditPending ? (
          <ReportSection title="Site health">
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-4 animate-spin text-base-content/50" />
            </div>
          </ReportSection>
        ) : data.latestCompletedAudit && data.auditHealth ? (
          <ReportAuditSection
            completedAt={data.latestCompletedAudit.completedAt}
            startUrl={data.latestCompletedAudit.startUrl}
            health={data.auditHealth}
          />
        ) : (
          <ReportSection title="Site health">
            <SectionNote>
              No completed site audits yet — run one from Site Audit to include
              crawl health here.
            </SectionNote>
          </ReportSection>
        )}

        <footer className="flex items-center justify-between border-t border-base-300 pt-3 text-[11px] text-base-content/50">
          <span>
            Generated with OpenSEO
            {hasAnyRankData ? "" : " · data still filling in"}
          </span>
          <span>openseo.so</span>
        </footer>
      </div>
    </div>
  );
}
