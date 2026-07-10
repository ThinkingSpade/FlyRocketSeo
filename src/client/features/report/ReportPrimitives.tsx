import type { ReactNode } from "react";

// Document-flavored building blocks for the client report. Deliberately
// quieter than the dashboard cards: this page is designed to be printed and
// handed to a client, so sections read like a document, not an app.

export function ReportSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="break-inside-avoid space-y-3">
      <div className="border-b border-base-300 pb-1.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-base-content/60">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function SectionNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-base-300 px-4 py-6 text-center text-xs text-base-content/60">
      {children}
    </p>
  );
}

export function StatTile({
  label,
  value,
  delta,
  deltaGoodWhen = "up",
}: {
  label: string;
  value: string;
  /** Signed change vs the comparison period; omit to hide the delta row. */
  delta?: number | null;
  /** Whether a positive delta is good (green) — position deltas invert. */
  deltaGoodWhen?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-base-300 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-base-content/50">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {delta !== undefined ? (
        <DeltaBadge value={delta} goodWhen={deltaGoodWhen} />
      ) : null}
    </div>
  );
}

function DeltaBadge({
  value,
  goodWhen = "up",
  suffix = "",
}: {
  value: number | null;
  goodWhen?: "up" | "down";
  suffix?: string;
}) {
  if (value === null || value === 0) {
    return (
      <p className="text-xs tabular-nums text-base-content/40">
        {value === 0 ? "no change" : "—"}
      </p>
    );
  }
  const improving = goodWhen === "up" ? value > 0 : value < 0;
  const rendered = `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value))}${suffix}`;
  return (
    <p
      className={`text-xs font-medium tabular-nums ${
        improving ? "text-success" : "text-error"
      }`}
    >
      {rendered}
    </p>
  );
}

export function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString("en-US")
    : rounded.toFixed(1);
}

export function formatPosition(value: number | null): string {
  return value === null ? "—" : formatNumber(value);
}

const renderPosition = (position: number | null) =>
  position === null ? (
    <span className="text-base-content/40">not ranking</span>
  ) : (
    <span className="font-mono">#{position}</span>
  );

/** "#13 → #1" movement cell; null renders as "not ranking". */
export function MovementCell({
  from,
  to,
}: {
  from: number | null;
  to: number | null;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
      {renderPosition(from)}
      <span aria-hidden className="text-base-content/40">
        →
      </span>
      {renderPosition(to)}
    </span>
  );
}
