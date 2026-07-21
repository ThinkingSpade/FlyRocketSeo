import type { ReactNode } from "react";

/**
 * Cover page and chapter framing for the Client Report, so the printed PDF
 * reads like an agency deliverable rather than a dashboard dump: a title page,
 * numbered chapters, and a running head carrying the domain on every page.
 */

export function ReportCover({
  projectName,
  domain,
  periodLabel,
  preparedBy,
  agency,
}: {
  projectName: string;
  domain: string | null;
  periodLabel: string;
  preparedBy: string;
  agency: string;
}) {
  return (
    <section className="report-cover flex min-h-[240px] flex-col justify-between rounded-xl border border-base-300 bg-base-200/40 p-8 print:min-h-[60vh] print:border-0 print:bg-transparent print:p-0">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-base-content/50">
          {periodLabel}
        </p>
        <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl">
          SEO Performance
          <br />
          Report
        </h1>
        <p className="mt-4 max-w-md text-sm text-base-content/70">
          Performance report and ranking analysis for{" "}
          <span className="font-medium text-base-content">
            {domain ?? projectName}
          </span>
          .
        </p>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-6 border-t border-base-300 pt-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-base-content/45">
            Prepared for
          </p>
          <p className="mt-1 text-sm font-medium">{projectName}</p>
        </div>
        {preparedBy || agency ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-base-content/45">
              Prepared by
            </p>
            {preparedBy ? (
              <p className="mt-1 text-sm font-medium">{preparedBy}</p>
            ) : null}
            {agency ? (
              <p className="text-sm text-base-content/70">{agency}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * A numbered chapter divider. `number` is the two-digit chapter label from the
 * report structure ("01"), `kicker` its category ("PERFORMANCE"). Starts a new
 * printed page so chapters never straddle a page break.
 */
export function ReportChapter({
  number,
  kicker,
  domain,
  children,
}: {
  number: string;
  kicker: string;
  domain: string | null;
  children: ReactNode;
}) {
  return (
    <section className="report-chapter space-y-4">
      <div className="flex items-baseline justify-between gap-4 border-b border-base-300 pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold tabular-nums text-base-content/25">
            {number}
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-base-content/60">
            {kicker}
          </span>
        </div>
        {domain ? (
          <span className="truncate text-[11px] text-base-content/40">
            {domain}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Narrative paragraphs generated from the data, above each chapter's tables. */
export function ReportNarrative({ paragraphs }: { paragraphs: string[] }) {
  if (paragraphs.length === 0) return null;
  return (
    <div className="space-y-2">
      {paragraphs.map((paragraph) => (
        <p
          key={paragraph}
          className="text-sm leading-relaxed text-base-content/80"
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/** A big single stat, for the backlink-profile block. */
export function StatBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3 text-center">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-base-content/55">
        {label}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-base-content/45">{hint}</div>
      ) : null}
    </div>
  );
}
