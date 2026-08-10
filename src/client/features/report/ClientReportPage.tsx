import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ReportToolbar } from "@/client/features/report/ReportToolbar";
import { ReportCover } from "@/client/features/report/ReportChrome";
import { ReportPages } from "@/client/features/report/ReportPages";
import { useClientReportData } from "@/client/features/report/useClientReportData";
import { Button, buttonVariants } from "@cloudflare/kumo/components/button";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Loader } from "@cloudflare/kumo/components/loader";

// The classic print-only-section trick: everything hides except the report, so
// the browser's Print → Save as PDF produces a clean client deliverable
// regardless of the app shell around it.
const PRINT_STYLES = `
/* The report must not track the viewer's light/dark theme — it is printed and
   emailed, and the client opening the PDF should get the sheet the agency saw.
   \`color-scheme\` is the entire mechanism the app's palette turns on: every
   surface token resolves through light-dark(), so pinning it here holds this
   whole subtree to the light palette in one declaration, and any section added
   later inherits that for free. Without it, a viewer on the dark theme printed
   near-white type and charcoal tiles onto a near-black sheet.
   The explicit background and colour cover what \`color-scheme\` cannot: text
   that carries no token class inherits from <body>, which is themed. */
#client-report {
  color-scheme: light;
  background: #ffffff;
  color: #2f3a49;
}

/* Table styling is applied at the report root so every existing section picks
   it up without each one re-implementing the look. */
#client-report table { width: 100%; border-collapse: collapse; }
#client-report thead tr { background: #0a1525; }
#client-report thead th {
  padding: 10px 12px; text-align: left; color: #ffffff;
  font-size: 12.5px; font-weight: 600; letter-spacing: 0.01em;
}
#client-report tbody td {
  padding: 9px 12px; font-size: 12.5px; color: #2f3a49;
  border-bottom: 1px solid #dfe4ec;
}
/* Hairline and zebra are Ink desaturated toward white. The warm peach tints
   these replace were left over from the indigo palette and read as a different
   report to the Ink header sitting directly above them. */
#client-report tbody tr:nth-child(even) { background: #f5f7fa; }
#client-report .report-page:first-of-type { break-before: auto; }

@media print {
  body * { visibility: hidden; }
  #client-report, #client-report * { visibility: visible; }
  #client-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
  /* \`visibility\` hides the app but leaves its background painted, so on the
     dark theme every sheet came out of the printer as a black field. */
  html, body { background: #ffffff !important; }
  .report-no-print { display: none !important; }
  .report-section { break-inside: avoid; }
  /* Long tables may run onto the next sheet, but never mid-row, and the header
     repeats when they do — otherwise the overflow arrives as unlabelled rows. */
  #client-report table { break-inside: auto; }
  #client-report thead { display: table-header-group; }
  #client-report tr { break-inside: avoid; }
  h2, h3 { break-after: avoid; }

  /* One topic per sheet, mirroring how a chaptered report paginates. Each page
     takes the whole sheet so the chapter spine runs its full height and the
     folio sits on the bottom margin, instead of both stopping wherever the
     content happened to end — which left every sheet two-thirds empty.
     99%, not 100: a rounded-up full height spills a blank sheet after each. */
  .report-page, .report-cover { min-height: 99vh; }
  .report-page { break-before: page; }
  .report-cover { break-after: page; }
  /* The on-screen gap between pages would otherwise ride into the break and
     push each sheet's content down off its own page. */
  #client-report > * { margin-top: 0 !important; margin-bottom: 0 !important; }
}
/* Colour bands and tinted rows must survive the print pipeline — Chrome drops
   backgrounds otherwise, which would flatten the whole design to white. */
#client-report { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

/* A real page margin, rather than the full bleed this replaced.
   The bands and the cover no longer run to the paper edge, and that is the
   point: the two richest chapters (the link profile, the quick wins) hold four
   tables each and genuinely overflow onto a second sheet. A continuation sheet
   carries no chapter band and no folio — only rows — and under a zero margin
   those rows started hard against the top trim and ran off the bottom one,
   which every physical printer clips. Chrome ignores named @page rules here, so
   a full-bleed cover with inset body sheets is not available; one honest margin
   for the whole document is. */
@page { margin: 12mm; }
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
                className={buttonVariants({ size: "sm" })}
              >
                Refresh domain overview
              </Link>
            ) : null}
            {data.backlinksSnapshotMissing ? (
              <Link
                to="/p/$projectId/backlinks"
                params={{ projectId }}
                search={{ target: data.domain ?? undefined }}
                className={buttonVariants({ size: "sm" })}
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

        <ReportPages
          data={data}
          generatedAt={generatedAt}
          foot={`Prepared with FlyRocketSEO · ${generatedAt}${
            agency ? ` · ${agency}` : ""
          }`}
        />

        {/* Screen-only: in print the same line runs as a foot on every sheet.
            As a single trailing block it landed on a fourteenth sheet of its
            own once each page was given the full page height. */}
        <footer className="report-no-print border-t border-base-300 pt-3 text-xs text-base-content/50">
          Prepared with FlyRocketSEO · {generatedAt}
          {agency ? ` · ${agency}` : ""}
        </footer>
      </div>
    </div>
  );
}
