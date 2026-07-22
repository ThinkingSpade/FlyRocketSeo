import type { ReactNode } from "react";

/**
 * Cover page and per-page framing for the Client Report, so the printed PDF
 * reads like an agency deliverable rather than a dashboard dump.
 *
 * Colours are hard-coded from the brand palette (primary #4934c7, accent
 * #c2410c) rather than themed: this artefact gets printed and emailed, so it
 * must look identical regardless of the viewer's light/dark theme.
 *
 * Layout follows one-topic-per-page — each `ReportPage` is exactly one printed
 * sheet: a chapter band, a single section, and a page number.
 */

const INK = "#1b1149"; // deep indigo, the header notch
const BRAND = "#4934c7"; // primary indigo
const BRAND_DEEP = "#2f1f8f"; // gradient end
const ACCENT = "#c2410c"; // orange, for links and emphasis
const RAIL = "#e3dff7"; // lavender edge rail
const BODY = "#3f3d56"; // paragraph ink

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
      className="report-cover relative flex min-h-[420px] flex-col justify-between overflow-hidden p-10 print:min-h-[86vh]"
      style={{
        background: `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 100%)`,
        color: "#ffffff",
      }}
    >
      <div className="flex items-start justify-between gap-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/85">
          {periodLabel}
        </p>
        {agency ? (
          <p className="text-right text-sm font-semibold tracking-wide">
            {agency}
          </p>
        ) : null}
      </div>

      <div className="py-10">
        <h1 className="text-5xl font-bold leading-[1.05] sm:text-6xl">
          SEO Performance
          <br />
          Report
        </h1>
        <p className="mt-6 max-w-lg text-base text-white/90">
          Performance report and ranking analysis of{" "}
          <span
            className="font-semibold underline decoration-2 underline-offset-4"
            style={{ color: "#ff8b5e" }}
          >
            {domain ?? projectName}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <CoverField label="Prepared for" value={projectName} />
        {preparedBy || agency ? (
          <CoverField label="Prepared by" value={preparedBy || agency} />
        ) : null}
      </div>

      {/* Decorative chevron band, echoing the cover art in the reference. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
        style={{
          background: `repeating-linear-gradient(115deg, ${ACCENT} 0 10px, transparent 10px 22px)`,
          opacity: 0.9,
        }}
      />
    </section>
  );
}

function CoverField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
        {label}
      </p>
      <p className="mt-1 text-base font-medium">{value}</p>
    </div>
  );
}

/**
 * One printed page: the chapter band (number + kicker + domain), a single
 * section title, its content, and the page number.
 *
 * The same chapter number appears on several consecutive pages when a chapter
 * covers several topics — matching how a chaptered report paginates.
 */
export function ReportPage({
  number,
  kicker,
  domain,
  title,
  pageNumber,
  children,
}: {
  number: string;
  kicker: string;
  domain: string | null;
  title: string;
  pageNumber?: number;
  children: ReactNode;
}) {
  return (
    <section className="report-page relative flex min-h-[320px] flex-col">
      <div className="relative flex">
        {/* Dark notch on the leading edge of the band. */}
        <div
          aria-hidden
          className="w-10 shrink-0"
          style={{ backgroundColor: INK }}
        />
        <div
          className="flex-1 px-7 py-6"
          style={{
            background: `linear-gradient(120deg, ${BRAND_DEEP} 0%, ${BRAND} 100%)`,
            color: "#ffffff",
          }}
        >
          <p className="text-4xl font-bold leading-none tabular-nums">
            {number}
          </p>
          <p className="mt-1 text-3xl font-bold uppercase leading-tight tracking-tight">
            {kicker}
          </p>
          {domain ? (
            <p
              className="mt-1 text-sm font-medium underline decoration-2 underline-offset-4"
              style={{ color: "#ff8b5e" }}
            >
              {domain}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1">
        {/* Lavender rail down the content edge. */}
        <div
          aria-hidden
          className="w-10 shrink-0"
          style={{ backgroundColor: RAIL }}
        />
        <div className="flex-1 space-y-4 px-7 py-6">
          <h2
            className="text-2xl font-bold uppercase tracking-tight"
            style={{ color: BRAND }}
          >
            {title}
          </h2>
          {children}
        </div>
      </div>

      {pageNumber != null ? (
        <p className="px-7 pb-4 text-right text-xs text-base-content/40">
          Page {pageNumber}
        </p>
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
      className="border-l-4 py-1 pl-4 text-[15px] italic leading-relaxed"
      style={{ borderColor: ACCENT, color: BODY }}
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
      {items.slice(0, 2).map((item, index) => (
        <div
          key={item.label}
          className="rounded-xl p-6 text-center"
          style={{
            background:
              index === 0
                ? `linear-gradient(135deg, ${BRAND_DEEP} 0%, ${BRAND} 100%)`
                : `linear-gradient(135deg, #e2560f 0%, ${ACCENT} 100%)`,
            color: "#ffffff",
          }}
        >
          <div className="text-5xl font-bold tabular-nums">{item.value}</div>
          <div className="mt-2 text-sm font-semibold">{item.label}</div>
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
    <div className="rounded-lg bg-base-200/60 p-4">
      <p className="text-sm font-bold" style={{ color: BRAND }}>
        {title}
      </p>
      <dl className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <dt className="text-sm text-base-content/70">{row.label}</dt>
            <dd
              className="text-sm font-semibold tabular-nums"
              style={{ color: ACCENT }}
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
    <div className="rounded-lg bg-base-200/60 p-4 text-center">
      <div className="text-2xl font-bold tabular-nums" style={{ color: BRAND }}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-base-content/60">
        {label}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-base-content/45">{hint}</div>
      ) : null}
    </div>
  );
}
