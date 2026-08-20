import { meteredActionLabel } from "@/client/components/MeteredActionLabel";
import { useState, type ReactNode } from "react";
import {
  CaretDown,
  Copy,
  Download,
  FileArrowDown,
  DotsThree,
  Play,
  ArrowsClockwise,
  Table,
} from "@phosphor-icons/react";
import { Button } from "@cloudflare/kumo/components/button";

function ToolbarMenu({
  label,
  icon,
  title,
  children,
}: {
  label?: string;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Both `title` and `label` are optional, so neither alone can be trusted to
  // name the trigger. The fallback is deliberately generic rather than clever:
  // a wrong name is worse than a plain one.
  const accessibleLabel = title ?? label ?? "Open menu";
  return (
    <div className="relative">
      {/* Two branches rather than `shape={label ? "base" : "square"}`, because
          Kumo models icon-only buttons as a separate props union: a `shape` of
          type `"base" | "square"` matches neither member, and the square member
          requires `aria-label` to be a definite string. The old code passed
          `title ?? label`, both optional — so the icon-only trigger could render
          with no accessible name at all. `accessibleLabel` closes that. */}
      {label ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((c) => !c)}
          title={title}
          aria-label={accessibleLabel}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {icon}
          {label}
          <CaretDown className="size-3.5 opacity-60" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          shape="square"
          onClick={() => setOpen((c) => !c)}
          title={title}
          aria-label={accessibleLabel}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {icon}
        </Button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-base-300 bg-base-100 shadow-lg py-1 min-w-[230px]"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-start gap-2 px-3 py-2 text-sm hover:bg-base-200 disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex flex-col items-start text-left">
        <span>{label}</span>
        {description && (
          <span className="text-xs text-base-content/50">{description}</span>
        )}
      </span>
    </button>
  );
}

export function MoreMenu({
  onCheckNow,
  checkBusy,
  checkBlockedReason,
  onRefreshMetrics,
  metricsRefreshing,
  hasData,
}: {
  onCheckNow: () => void;
  checkBusy: boolean;
  /**
   * Why a rank check cannot be run right now, or null when it can. Rendered
   * on a DISABLED item rather than hiding the item: this used to be shown
   * enabled whenever the plan allowed it, and a config with no keywords sent
   * the click into `if (count > 0)` in the parent, where it vanished with no
   * toast and no explanation. A capability you cannot use is still worth
   * seeing, provided it says why.
   */
  checkBlockedReason: string | null;
  onRefreshMetrics: () => void;
  metricsRefreshing: boolean;
  hasData: boolean;
}) {
  return (
    <ToolbarMenu icon={<DotsThree className="size-4" />} title="More actions">
      <MenuItem
        icon={<Play className="size-3.5" />}
        // The metered one of the pair. "Update keyword stats" below has carried
        // a credits label all along while this -- which fetches live Google
        // positions for every tracked keyword -- carried none, so the cheaper
        // action was the one that looked like it cost money.
        label={
          checkBusy
            ? "Running..."
            : meteredActionLabel("Check rankings", { kind: "credits" })
        }
        description={checkBlockedReason ?? "Fetch current Google positions"}
        onClick={onCheckNow}
        disabled={checkBusy || checkBlockedReason !== null}
      />
      <MenuItem
        icon={
          <ArrowsClockwise
            className={`size-3.5 ${metricsRefreshing ? "animate-spin" : ""}`}
          />
        }
        label={
          metricsRefreshing
            ? "Refreshing..."
            : meteredActionLabel("Update keyword stats", {
                kind: "credits",
              })
        }
        description="Volume, difficulty & CPC — not rankings"
        onClick={onRefreshMetrics}
        disabled={metricsRefreshing || !hasData}
      />
    </ToolbarMenu>
  );
}

export function ExportMenu({
  onExport,
  onExportToSheets,
  onCopyKeywords,
  hasData,
}: {
  onExport: () => void;
  onExportToSheets: () => void;
  onCopyKeywords: () => void;
  hasData: boolean;
}) {
  return (
    <ToolbarMenu label="Export" icon={<Download className="size-3.5" />}>
      <MenuItem
        icon={<Table className="size-3.5" />}
        label="Export to Sheets"
        onClick={onExportToSheets}
        disabled={!hasData}
      />
      <MenuItem
        icon={<FileArrowDown className="size-3.5" />}
        label="Export CSV"
        onClick={onExport}
        disabled={!hasData}
      />
      <MenuItem
        icon={<Copy className="size-3.5" />}
        label="Copy keywords"
        onClick={onCopyKeywords}
        disabled={!hasData}
      />
    </ToolbarMenu>
  );
}
