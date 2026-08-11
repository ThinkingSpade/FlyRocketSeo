// NOTE: this module is re-exported by `components/index.ts`, so it must not
// statically import a heavy leaf library -- every barrel consumer would carry
// it. That is exactly why `AreaTrendChart` now lives in its own
// `AreaTrendChart.tsx` (see that file's doc comment): recharts here put 195 KB
// into the client ENTRY chunk for every visitor on every route.
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import { FloatingTooltip, useFloatingTooltip } from "./FloatingTooltip";

export type SortField =
  | "keyword"
  | "searchVolume"
  | "cpc"
  | "competition"
  | "keywordDifficulty";
export type SortDir = "asc" | "desc";

export function HeaderHelpLabel({
  label,
  helpText,
  delayMs = 150,
  focusable = false,
}: {
  label: string;
  helpText: string;
  delayMs?: number;
  /**
   * Give the trigger its own tab stop.
   *
   * Off by default because most call sites nest this INSIDE a `<button>`
   * (SortableHeader, SortHeader), where the button already carries the tab
   * stop -- React's `onFocus` is `focusin`, which bubbles, so focusing that
   * button opens this tooltip already. Adding a second focusable there would
   * mean interactive content inside a button: invalid HTML and an extra tab
   * stop for no gain.
   *
   * Turn it ON when the trigger stands alone in a cell or header with no
   * focusable ancestor. Without it, such a trigger is mouse-hover-only --
   * exactly the gap `title` has, which is usually the reason this component
   * was chosen over `title` in the first place.
   */
  focusable?: boolean;
}) {
  const tooltip = useFloatingTooltip<HTMLSpanElement>({ delayMs });

  return (
    <span
      ref={tooltip.triggerRef}
      tabIndex={focusable ? 0 : undefined}
      className="relative inline-flex items-center"
      onMouseEnter={tooltip.scheduleOpen}
      onMouseLeave={tooltip.close}
      onFocus={tooltip.scheduleOpen}
      onBlur={tooltip.close}
      onKeyDown={(e) => {
        if (e.key === "Escape") tooltip.close();
      }}
      aria-describedby={tooltip.isOpen ? tooltip.tooltipId : undefined}
    >
      <span>{label}</span>
      {tooltip.isOpen && typeof document !== "undefined"
        ? createPortal(
            <FloatingTooltip id={tooltip.tooltipId} position={tooltip.position}>
              {helpText}
            </FloatingTooltip>,
            document.body,
          )
        : null}
    </span>
  );
}

export function SortHeader({
  label,
  helpText,
  field,
  current,
  dir,
  onToggle,
  className,
}: {
  label: string;
  helpText?: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onToggle: (f: SortField) => void;
  className?: string;
}) {
  const isActive = field === current;
  const tooltip = useFloatingTooltip<HTMLButtonElement>({
    enabled: !!helpText,
  });

  return (
    <button
      ref={tooltip.triggerRef}
      className={`inline-flex items-center gap-0.5 hover:text-primary transition-colors cursor-pointer select-none ${className ?? ""}`}
      onClick={() => onToggle(field)}
      onMouseEnter={tooltip.scheduleOpen}
      onMouseLeave={tooltip.close}
      onFocus={tooltip.scheduleOpen}
      onBlur={tooltip.close}
      onKeyDown={(e) => {
        if (e.key === "Escape") tooltip.close();
      }}
      aria-describedby={
        tooltip.isOpen && helpText ? tooltip.tooltipId : undefined
      }
    >
      {label}
      {isActive &&
        (dir === "asc" ? (
          <CaretUp className="size-3" />
        ) : (
          <CaretDown className="size-3" />
        ))}
      {tooltip.isOpen && helpText && typeof document !== "undefined"
        ? createPortal(
            <FloatingTooltip id={tooltip.tooltipId} position={tooltip.position}>
              {helpText}
            </FloatingTooltip>,
            document.body,
          )
        : null}
    </button>
  );
}
