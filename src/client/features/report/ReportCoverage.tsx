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
 *
 * `notCovered` is a separate block rather than more omissions, because the two
 * are different promises. An omission is a gap this report would fill if the
 * analysis had run; a not-covered feature is one the report has no chapter for
 * however much work went into it, so the "run it and it appears next time" line
 * above the omissions would be untrue of it.
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
  notCovered,
}: {
  /** Chapter pages that follow this one. */
  included: number;
  omissions: ReportOmission[];
  /** Features this report has no chapter for, whatever the project has run. */
  notCovered: readonly string[];
}) {
  if (omissions.length === 0 && notCovered.length === 0) return null;

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
          {summarize(included, omissions.length)}
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

      {notCovered.length > 0 ? (
        <dl className="flex flex-col gap-0.5">
          <dt className="text-[13px] font-semibold" style={{ color: BODY }}>
            {notCovered.join(" · ")}
          </dt>
          <dd className="text-[13px] leading-relaxed" style={{ color: MUTED }}>
            Not covered by this report. These analyses run in FlyRocketSEO and
            may well have work behind them this period, but the report has no
            chapter for them yet — their absence above is not a finding about
            your site.
          </dd>
        </dl>
      ) : null}
    </div>
  );
}

/**
 * The lead sentence, which must stay true of the omissions ALONE.
 *
 * The not-covered block below carries its own explanation precisely because
 * counting those features here would make "running the analysis named in each
 * adds it to the next report" a promise the report cannot keep.
 */
function summarize(included: number, omitted: number): string {
  const follows = `${included} ${included === 1 ? "chapter follows" : "chapters follow"}.`;
  if (omitted === 0) {
    return included === 0
      ? "None of the analyses this report draws on have produced data yet."
      : `${follows} Every analysis this report covers produced data.`;
  }
  const gaps =
    omitted === 1
      ? "One section is not included yet"
      : `${omitted} sections are not included yet`;
  const tail = `${gaps}, for the reasons below — running the analysis named in each adds it to the next report.`;
  return included === 0
    ? `None of the analyses this report draws on have produced data yet. ${tail}`
    : `${follows} ${tail}`;
}
