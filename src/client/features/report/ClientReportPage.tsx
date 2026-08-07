import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ReportToolbar } from "@/client/features/report/ReportToolbar";
import { ReportCover } from "@/client/features/report/ReportChrome";
import { ReportPages } from "@/client/features/report/ReportPages";
import { useClientReportData } from "@/client/features/report/useClientReportData";
import { Button } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";

// The classic print-only-section trick: everything hides except the report, so
// the browser's Print → Save as PDF produces a clean client deliverable
// regardless of the app shell around it.
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

export function ClientReportPage({ projectId }: { projectId: string }) {
  const data = useClientReportData(projectId);
  const [preparedBy, setPreparedBy] = useState(() =>
    readStored(PREPARED_BY_KEY),
  );
  const [agency, setAgency] = useState(() => readStored(AGENCY_KEY));

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

      {data.domainSnapshotMissing ||
      data.backlinksSnapshotMissing ||
      data.keywordDetailsMissing ||
      data.backlinkDetailsMissing ? (
        <div className="report-no-print mb-4 rounded-lg border border-base-300 bg-base-100 p-4">
          <p className="text-sm font-medium">
            No data yet — refresh missing report sections
          </p>
          <p className="mt-1 text-xs text-base-content/60">
            Saved overview snapshots are free to reuse. Detail sections are
            metered and only load after the paid-request buttons below.
          </p>
          {data.keywordDetailsError ? (
            <Banner variant="error" className="mt-3 text-sm">
              {data.keywordDetailsError}
            </Banner>
          ) : null}
          {data.backlinkDetailsError ? (
            <Banner variant="error" className="mt-3 text-sm">
              {data.backlinkDetailsError}
            </Banner>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {data.domainSnapshotMissing ? (
              <Link
                to="/p/$projectId/domain"
                params={{ projectId }}
                search={{ domain: data.domain ?? undefined }}
                className="btn btn-sm"
              >
                Refresh domain overview
              </Link>
            ) : null}
            {data.backlinksSnapshotMissing ? (
              <Link
                to="/p/$projectId/backlinks"
                params={{ projectId }}
                search={{ target: data.domain ?? undefined }}
                className="btn btn-sm"
              >
                Refresh backlinks
              </Link>
            ) : null}
            {data.keywordDetailsMissing ? (
              <Button
                type="button"
                size="sm"
                disabled={data.keywordDetailsLoading}
                onClick={() => data.refreshKeywordDetails()}
              >
                {data.keywordDetailsLoading ? <Loader size="sm" /> : null}
                Load keyword details · 1 paid request
              </Button>
            ) : null}
            {data.backlinkDetailsMissing ? (
              <Button
                type="button"
                size="sm"
                disabled={data.backlinkDetailsLoading}
                onClick={() => data.refreshBacklinkDetails()}
              >
                {data.backlinkDetailsLoading ? <Loader size="sm" /> : null}
                Load backlink details · 2 paid requests
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div id="client-report" className="space-y-8">
        <ReportCover
          projectName={data.project?.name ?? "Project"}
          domain={data.domain}
          periodLabel={periodLabel}
          preparedBy={preparedBy}
          agency={agency}
        />

        <ReportPages data={data} generatedAt={generatedAt} />

        <footer className="border-t border-base-300 pt-3 text-xs text-base-content/50">
          Prepared with FlyRocketSEO · {generatedAt}
          {agency ? ` · ${agency}` : ""}
        </footer>
      </div>
    </div>
  );
}
