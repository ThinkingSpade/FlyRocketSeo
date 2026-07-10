import { Link2Off, Loader2, Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  reportShareSnapshotSchema,
  type ReportShareSnapshot,
} from "@/types/schemas/report";
import { RankBlockView } from "./ReportRankBlock";
import {
  ReportAuditSection,
  ReportEventsSection,
  ReportGscSection,
} from "./ReportSections";
import { ReportSection, SectionNote } from "./ReportPrimitives";

interface SharePayload {
  rangeLabel: string;
  snapshot: ReportShareSnapshot;
}

const sharePayloadSchema = z.object({ snapshot: reportShareSnapshotSchema });

/** Fetch + re-validate the stored snapshot; treat anything else as missing. */
async function fetchShare(token: string): Promise<SharePayload | null> {
  const response = await fetch(
    `/api/report-share/${encodeURIComponent(token)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("share_fetch_failed");
  const parsed = sharePayloadSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  return {
    rangeLabel: parsed.data.snapshot.rangeLabel,
    snapshot: parsed.data.snapshot,
  };
}

/**
 * Read-only public view of a shared report snapshot. Renders stored data
 * only — no auth, no app shell, no live queries — and prints cleanly via the
 * same document styles as the in-app report.
 */
export function PublicReportPage({ token }: { token: string }) {
  const shareQuery = useQuery({
    queryKey: ["publicReportShare", token],
    queryFn: () => fetchShare(token),
    retry: 1,
    staleTime: Infinity,
  });

  if (shareQuery.isPending) {
    return (
      <PublicFrame>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-5 animate-spin text-base-content/50" />
        </div>
      </PublicFrame>
    );
  }

  const payload = shareQuery.data;
  if (shareQuery.isError || !payload) {
    return (
      <PublicFrame>
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <Link2Off className="size-6 text-base-content/40" />
          <h1 className="text-lg font-semibold">
            This report link is no longer available
          </h1>
          <p className="max-w-sm text-sm text-base-content/60">
            The link may have been revoked or never existed. Ask whoever sent it
            for a fresh one.
          </p>
        </div>
      </PublicFrame>
    );
  }

  const { snapshot } = payload;
  const branding = snapshot.branding;

  return (
    <PublicFrame>
      <div className="flex justify-end pb-3 print:hidden">
        <button
          type="button"
          className="btn btn-sm gap-1.5"
          onClick={() => window.print()}
        >
          <Printer className="size-3.5" />
          Save as PDF
        </button>
      </div>

      <div
        data-theme="light"
        className="space-y-6 rounded-xl border border-base-300 bg-base-100 p-6 text-base-content shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
      >
        <style>{`@media print { @page { margin: 14mm; } }`}</style>

        <header className="flex items-start justify-between gap-4 border-b border-base-300 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-base-content/50">
              SEO Report
            </p>
            <h1 className="text-2xl font-bold">{snapshot.projectTitle}</h1>
            <p className="pt-1 text-xs text-base-content/60">
              {snapshot.rangeLabel} · Generated {snapshot.generatedAt}
              {branding?.preparedBy ? (
                <> · Prepared by {branding.preparedBy}</>
              ) : null}
            </p>
          </div>
          {branding?.logoDataUri || branding?.brandName ? (
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
              {branding.logoDataUri ? (
                <img
                  src={branding.logoDataUri}
                  alt={branding.brandName ?? "Agency logo"}
                  className="max-h-12 max-w-40 object-contain"
                />
              ) : null}
              {branding.brandName ? (
                <p className="text-sm font-semibold">{branding.brandName}</p>
              ) : null}
            </div>
          ) : null}
        </header>

        <ReportSection
          title="Rank performance"
          subtitle="Google positions for tracked keywords over the report period"
        >
          {snapshot.rankBlocks.length === 0 ? (
            <SectionNote>
              No rank tracking data was included in this report.
            </SectionNote>
          ) : (
            <div className="space-y-8">
              {snapshot.rankBlocks.map((block) => (
                <RankBlockView
                  key={`${block.domain}-${block.device}`}
                  block={block}
                />
              ))}
            </div>
          )}
        </ReportSection>

        {snapshot.gsc ? <ReportGscSection gsc={snapshot.gsc} /> : null}

        <ReportEventsSection
          events={snapshot.events}
          rangeLabel={snapshot.rangeLabel}
        />

        {snapshot.audit ? (
          <ReportAuditSection
            completedAt={snapshot.audit.completedAt}
            startUrl={snapshot.audit.startUrl}
            health={snapshot.audit.health}
          />
        ) : null}

        <footer className="flex items-center justify-between border-t border-base-300 pt-3 text-[11px] text-base-content/50">
          <span>
            {branding?.brandName
              ? `${branding.brandName} · Generated with OpenSEO`
              : "Generated with OpenSEO"}
          </span>
          <a
            href="https://openseo.so"
            target="_blank"
            rel="noreferrer"
            className="link-hover"
          >
            openseo.so
          </a>
        </footer>
      </div>
    </PublicFrame>
  );
}

function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-base-200 print:bg-base-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 print:max-w-none print:p-0">
        {children}
      </div>
    </div>
  );
}
