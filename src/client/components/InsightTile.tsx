import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type InsightTone =
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

// Plain colored icons, no chip backgrounds — matches the app's native icon
// language (muted lucide glyphs like `text-base-content/45`). Tones stay
// quiet; only the meaning-bearing ones get color.
const ICON_COLOR: Record<InsightTone, string> = {
  primary: "text-primary/70",
  success: "text-success/80",
  warning: "text-warning",
  error: "text-error/80",
  info: "text-info/80",
  neutral: "text-base-content/35",
};

const BORDER: Record<InsightTone, string> = {
  primary: "border-base-300",
  success: "border-base-300",
  warning: "border-warning/40",
  error: "border-error/40",
  info: "border-base-300",
  neutral: "border-base-300",
};

/** A small inline icon for card headers, styled like the app's own icons. */
export function InsightIcon({
  icon: Icon,
  tone = "neutral",
}: {
  icon: LucideIcon;
  tone?: InsightTone;
}) {
  return (
    <Icon
      className={`size-4 shrink-0 ${tone === "neutral" ? "text-base-content/45" : ICON_COLOR[tone]}`}
    />
  );
}

/**
 * Stat tile in the app's native style: uppercase muted label with a small
 * quiet icon, big tabular value. `tone` colors the icon and, for
 * warning/error states, the border — no chip backgrounds.
 */
export function InsightTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
  title,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: InsightTone;
  title?: string;
}) {
  return (
    <div
      className={`rounded-lg border bg-base-100 p-3 ${BORDER[tone]}`}
      title={title}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-base-content/50">
          {label}
        </span>
        <Icon className={`size-3.5 shrink-0 ${ICON_COLOR[tone]}`} />
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-xs text-base-content/50">{hint}</div>
      ) : null}
    </div>
  );
}
