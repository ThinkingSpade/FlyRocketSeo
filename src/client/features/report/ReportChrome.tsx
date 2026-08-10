import type { ReactNode } from "react";

/**
 * Cover page and per-page framing for the Client Report, so the printed PDF
 * reads like an agency deliverable rather than a dashboard dump.
 *
 * Colours are hard-coded from the brand palette rather than themed: this
 * artefact gets printed and emailed, so it must look identical regardless of
 * the viewer's light/dark theme. (The report root also pins `color-scheme`,
 * which is what holds the token-driven sections to the light palette — see
 * PRINT_STYLES in ClientReportPage.)
 *
 * Layout follows one-topic-per-page — each `ReportPage` is exactly one printed
 * sheet: a chapter band, a single section, and a folio.
 */

const INK = "#0a1525"; // brand Ink — the chapter band, and headings on white
const SIGNAL = "#ff6a14"; // brand Signal — a mark, never type on white (2.9:1)
const SIGNAL_INK = "#c2410c"; // Signal darkened for type on white (5.2:1)
// The neutrals below are Ink desaturated toward white rather than the warm
// tints the previous palette left behind: a peach rule under an Ink band read
// as two different reports stapled together.
const BODY = "#2f3a49"; // paragraph ink — Ink at reading weight, 10.6:1
const MUTED = "#5c6a7d"; // secondary type — Ink lifted further, 4.9:1 on white
const HAIRLINE = "#dfe4ec"; // rules and dividers

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
    <section
      className="report-cover relative flex min-h-[420px] flex-col justify-between overflow-hidden p-10"
      style={{ backgroundColor: INK, color: "#ffffff" }}
    >
      <div className="flex items-start justify-between gap-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/80">
          {periodLabel}
        </p>
        {agency ? (
          <p className="text-right text-sm font-semibold tracking-wide">
            {agency}
          </p>
        ) : null}
      </div>

      <div className="py-10">
        {/* A single Signal rule, not the repeating chevron band this replaced:
            diagonal orange stripes read as hazard tape, and being positioned
            over the bottom of the cover they struck through the "Prepared for"
            value underneath. */}
        <div
          aria-hidden
          className="mb-8 h-1 w-16"
          style={{ backgroundColor: SIGNAL }}
        />
        <h1 className="text-5xl font-bold leading-[1.05] sm:text-6xl">
          SEO Performance
          <br />
          Report
        </h1>
        <p className="mt-6 max-w-lg text-base text-white/85">
          Performance report and ranking analysis of{" "}
          <span className="font-semibold" style={{ color: "#ff9256" }}>
            {domain ?? projectName}
          </span>
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-8 border-t pt-6"
        style={{ borderColor: "rgba(255,255,255,0.18)" }}
      >
        <CoverField label="Prepared for" value={projectName} />
        {preparedBy || agency ? (
          <CoverField label="Prepared by" value={preparedBy || agency} />
        ) : null}
      </div>
    </section>
  );
}

function CoverField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
        {label}
      </p>
      <p className="mt-1 text-base font-medium">{value}</p>
    </div>
  );
}

/**
 * One printed page: a compact chapter band, the page's own title, its content,
 * and a folio.
 *
 * The band is deliberately quiet. It used to set the kicker at text-3xl, which
 * made the chapter label — a running header — shout louder than the subject of
 * the sheet underneath it; the title is the dominant type now.
 */
export function ReportPage({
  number,
  kicker,
  domain,
  title,
  pageNumber,
  foot,
  children,
}: {
  number: string;
  kicker: string;
  domain: string | null;
  title: string;
  pageNumber?: number;
  /** Running foot, carried on every sheet so provenance survives the PDF. */
  foot?: string;
  children: ReactNode;
}) {
  return (
    <section className="report-page relative flex min-h-[320px] flex-col">
      {/* Paddings are picked so the band's label, the body text and the folio
          all sit on one left margin: the spine below is 4px, so the band takes
          pl-8 where the content column takes border-4 + pl-7. */}
      <div
        className="flex items-baseline gap-3 py-3.5 pl-8 pr-7"
        style={{ backgroundColor: INK, color: "#ffffff" }}
      >
        <p className="text-sm font-bold tabular-nums" style={{ color: SIGNAL }}>
          {number}
        </p>
        <p className="text-sm font-semibold uppercase tracking-[0.18em]">
          {kicker}
        </p>
        {domain ? (
          <p className="ml-auto text-xs text-white/60">{domain}</p>
        ) : null}
      </div>

      {/* The spine: brand Signal, running the full height of the sheet. It
          replaces a 40px pale-peach field that stopped wherever the content
          happened to end, leaving a stub halfway down the page. */}
      <div
        className="flex-1 space-y-5 border-l-4 py-8 pl-7 pr-7"
        style={{ borderColor: SIGNAL }}
      >
        <h2
          className="text-2xl font-bold uppercase tracking-tight"
          style={{ color: INK }}
        >
          {title}
        </h2>
        {children}
      </div>

      {pageNumber != null ? (
        <div
          className="ml-8 mr-7 flex items-baseline justify-between border-t pb-2 pt-3 text-[11px]"
          style={{ borderColor: HAIRLINE, color: MUTED }}
        >
          <span>{foot ?? ""}</span>
          <span className="tabular-nums">Page {pageNumber}</span>
        </div>
      ) : null}
    </section>
  );
}

/** Narrative paragraphs generated from the data, above each page's table. */
export function ReportNarrative({ paragraphs }: { paragraphs: string[] }) {
  if (paragraphs.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {paragraphs.map((paragraph) => (
        <p
          key={paragraph}
          className="text-[15px] leading-relaxed"
          style={{ color: BODY }}
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/**
 * The highlighted aside the reference uses on every page to explain what the
 * tool did for you. Deliberately factual — it describes analysis we actually
 * performed, never edits to the client's site.
 */
export function ReportCallout({ children }: { children: ReactNode }) {
  return (
    <p
      className="border-l-2 py-1 pl-4 text-[14px] italic leading-relaxed"
      style={{ borderColor: SIGNAL, color: MUTED }}
    >
      {children}
    </p>
  );
}

/** The two oversized headline figures at the top of a stats page. */
export function ReportHeroStats({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.slice(0, 2).map((item) => (
        <div
          key={item.label}
          className="rounded-lg border p-6 text-center"
          style={{ borderColor: HAIRLINE }}
        >
          <div
            className="text-4xl font-bold tabular-nums"
            style={{ color: INK }}
          >
            {item.value}
          </div>
          <div
            className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: MUTED }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Two-up supporting breakdown (Top countries / Link types). */
export function ReportBreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: HAIRLINE }}>
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: MUTED }}
      >
        {title}
      </p>
      <dl className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <dt className="text-sm" style={{ color: BODY }}>
              {row.label}
            </dt>
            <dd
              className="text-sm font-semibold tabular-nums"
              style={{ color: INK }}
            >
              {row.value.toLocaleString("en-US")}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A smaller supporting stat, sitting under the hero figures. */
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
    <div
      className="rounded-lg border p-4 text-center"
      style={{ borderColor: HAIRLINE }}
    >
      <div className="text-2xl font-bold tabular-nums" style={{ color: INK }}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-medium" style={{ color: MUTED }}>
        {label}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px]" style={{ color: SIGNAL_INK }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
