import type { ReportOmission } from "@/client/features/report/reportChapters";

/**
 * "What this report covers" — the chapters that had data, and the ones that
 * did not, with the reason for each.
 *
 * This exists because a report is generated from whatever analyses have been
 * run, and the honest answer for a project with only some of them is not
 * eleven sheets each carrying a chapter band and one sentence of apology. The
 * absences are real and the client should see them; they are just worth one
 * short list on the summary page rather than a sheet apiece.
 *
 * Reasons are grouped, because the common case is one cause producing several
 * absences — an unconnected Search Console silences five chapters at once, and
 * printing that sentence five times reads as five separate problems.
 */

// Ink desaturated toward white, matching ReportChrome. Hard-coded rather than
// themed for the same reason as the rest of the report: it gets printed.
const INK = "#0a1525";
const BODY = "#2f3a49";
const MUTED = "#5c6a7d";
const HAIRLINE = "#dfe4ec";

export function ReportCoverage({
  included,
  omissions,
}: {
  /** Chapter pages that follow this one. */
  included: number;
  omissions: ReportOmission[];
}) {
  if (omissions.length === 0) return null;

  const grouped = new Map<string, string[]>();
  for (const omission of omissions) {
    const titles = grouped.get(omission.reason);
    if (titles) titles.push(omission.title);
    else grouped.set(omission.reason, [omission.title]);
  }

  return (
    <div className="space-y-3 pt-2">
      <div
        className="border-t pt-4"
        style={{ borderColor: HAIRLINE, color: INK }}
      >
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em]">
          What this report covers
        </h3>
        <p
          className="mt-1.5 text-[15px] leading-relaxed"
          style={{ color: BODY }}
        >
          {included === 0
            ? "None of the analyses this report draws on have produced data yet."
            : `${included} ${included === 1 ? "chapter follows" : "chapters follow"}. ${
                omissions.length === 1
                  ? "One section is not included yet"
                  : `${omissions.length} sections are not included yet`
              }, for the reasons below — running the analysis named in each adds it to the next report.`}
        </p>
      </div>

      <dl className="space-y-2.5">
        {[...grouped.entries()].map(([reason, titles]) => (
          <div key={reason} className="flex flex-col gap-0.5">
            <dt className="text-[13px] font-semibold" style={{ color: BODY }}>
              {titles.join(" · ")}
            </dt>
            <dd
              className="text-[13px] leading-relaxed"
              style={{ color: MUTED }}
            >
              {reason}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
