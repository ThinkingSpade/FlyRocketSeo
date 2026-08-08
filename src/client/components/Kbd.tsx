import type { ReactNode } from "react";

/**
 * A keyboard key cap.
 *
 * Kumo has no standalone equivalent — its `DropdownMenu.Shortcut` only works
 * inside a menu — and DaisyUI's `kbd` is going away, so this is the one place
 * the treatment lives. It replaced four hand-written copies of the same utility
 * string, including one this migration had itself just added to the sidebar.
 *
 * `sm` is the default because that is what the shortcut lists use; `xs` is for
 * key caps sitting inside a line of running text, where the `sm` cap sets the
 * line height and makes the row jump.
 */
export function Kbd({
  children,
  size = "sm",
  className = "",
}: {
  children: ReactNode;
  size?: "xs" | "sm";
  className?: string;
}) {
  const sizeClass =
    size === "xs" ? "px-1 py-px text-[10px]" : "px-1.5 py-0.5 text-xs";

  return (
    <kbd
      className={`inline-flex items-center rounded border border-base-300 bg-base-100 font-sans text-base-content/60 ${sizeClass} ${className}`}
    >
      {children}
    </kbd>
  );
}
