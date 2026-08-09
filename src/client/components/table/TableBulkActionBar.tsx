import { CaretDown, Download, CircleNotch, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";

export function TableBulkActionBar({
  selectedCount,
  selectedLabel = "selected",
  actions,
  onClear,
  placement = "fixed",
}: {
  selectedCount: number;
  selectedLabel?: string;
  actions: ReactNode;
  onClear: () => void;
  placement?: "fixed" | "inline";
}) {
  if (selectedCount === 0) return null;

  const wrapperClass =
    placement === "fixed"
      ? "pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
      : "flex justify-center";
  const toolbarClass =
    placement === "fixed"
      ? "pointer-events-auto flex items-stretch overflow-visible rounded-xl border border-base-content/15 bg-base-300/85 shadow-2xl backdrop-blur"
      : "flex items-stretch overflow-visible rounded-xl border border-base-content/15 bg-base-200";

  return (
    <div className={wrapperClass}>
      <div role="toolbar" aria-label="Bulk actions" className={toolbarClass}>
        <div className="flex items-center gap-2 border-r border-base-content/10 px-3 py-2 text-sm">
          <button
            type="button"
            aria-label="Clear selection"
            className="-ml-1 rounded p-1 text-base-content/55 hover:bg-base-content/10 hover:text-base-content"
            onClick={onClear}
          >
            <X className="size-3.5" />
          </button>
          <span className="font-medium tabular-nums">{selectedCount}</span>
          <span className="text-base-content/60">{selectedLabel}</span>
        </div>
        {actions}
      </div>
    </div>
  );
}

export function TableBulkActionButton({
  icon,
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  const color =
    variant === "danger"
      ? "text-error hover:bg-error/10"
      : "text-base-content/85 hover:bg-base-content/10";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm disabled:opacity-50 ${color}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function TableBulkExportMenu({
  actions,
  busy,
}: {
  actions: Array<{
    label: ReactNode;
    icon?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }>;
  busy?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-base-content/85 hover:bg-base-content/10 disabled:opacity-50"
          >
            {busy ? (
              <CircleNotch className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Export
            <CaretDown className="size-3 opacity-60" />
          </button>
        }
      />
      {/* side="top": this bar floats at the bottom of the viewport, so the menu
          has to open upward — what `dropdown-top` used to do. */}
      <DropdownMenu.Content side="top" align="end" className="w-52">
        <ExportMenuItems actions={actions} busy={busy} />
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

/** The action list both export menus render. Kumo only injects its own `mr-2`
 *  for icon *components*, and callers hand these in as elements, so the gap is
 *  supplied here rather than at every call site. */
function ExportMenuItems({
  actions,
  busy,
}: {
  actions: ExportMenuAction[];
  busy?: boolean;
}) {
  return (
    <>
      {actions.map((action, index) => (
        <DropdownMenu.Item
          key={index}
          icon={
            action.icon ? (
              <span className="mr-2 inline-flex">{action.icon}</span>
            ) : undefined
          }
          disabled={busy || action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </DropdownMenu.Item>
      ))}
    </>
  );
}

type ExportMenuAction = {
  label: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

export function TableExportMenu({
  actions,
  variant = "secondary",
}: {
  actions: ExportMenuAction[];
  /** Replaces the old `buttonClassName`/`menuClassName` pair. Those existed so
   *  two callers could ask for a ghost button and a narrower menu by pasting
   *  DaisyUI class strings; the trigger is a Kumo Button now, so the intent is
   *  a named variant and the width is Kumo's to decide. */
  variant?: "secondary" | "ghost";
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button variant={variant} size="sm">
            <Download className="size-4" />
            Export
            <CaretDown className="size-3 opacity-60" />
          </Button>
        }
      />
      <DropdownMenu.Content align="end" className="w-56">
        <ExportMenuItems actions={actions} />
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
