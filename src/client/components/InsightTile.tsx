import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type InsightTone =
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral";

// Soft tinted icon chips per tone — daisyUI tokens only, dark-mode safe.
const ICON_CHIP: Record<InsightTone, string> = {
  primary: "bg-primary/12 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  error: "bg-error/12 text-error",
  info: "bg-info/12 text-info",
  neutral: "bg-base-content/8 text-base-content/60",
};

const BORDER: Record<InsightTone, string> = {
  primary: "border-base-300",
  success: "border-base-300",
  warning: "border-warning/40",
  error: "border-error/40",
  info: "border-base-300",
  neutral: "border-base-300",
};

/** The tinted icon chip alone — for card headers next to a title. */
export function InsightIcon({
  icon: Icon,
  tone = "neutral",
}: {
  icon: LucideIcon;
  tone?: InsightTone;
}) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-md ${ICON_CHIP[tone]}`}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

/**
 * Semrush-style stat tile: soft tinted icon chip, uppercase label, big
 * tabular value. `tone` tints the icon (and the border for warning/error
 * states so problem tiles pop without shouting).
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
      className={`rounded-xl border bg-base-100 p-3 ${BORDER[tone]}`}
      title={title}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${ICON_CHIP[tone]}`}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="truncate text-xs font-medium uppercase tracking-wide text-base-content/50">
          {label}
        </span>
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-xs text-base-content/50">{hint}</div>
      ) : null}
    </div>
  );
}
