import { Check, X } from "lucide-react";
import {
  ELEMENT_LABEL,
  type ElementProgress,
  type FixRow,
  type OnPageElement,
  type PageGroup,
} from "@/client/features/onpage/onPageModel";

/** Short element tag shown on each suggestion row. */
const ELEMENT_TAG: Record<OnPageElement, string> = {
  title: "Title",
  meta: "Meta",
  h1: "H1",
  alt: "Alt",
};

export function ProgressTiles({ tiles }: { tiles: ElementProgress[] }) {
  if (tiles.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => {
        const decided = tile.approved + tile.excluded;
        const pct = tile.total > 0 ? (decided / tile.total) * 100 : 0;
        return (
          <div
            key={tile.element}
            className="rounded-lg border border-base-300 bg-base-100 p-3"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-base-content/50">
              {tile.label}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums">
                {tile.approved}
              </span>
              <span className="text-xs text-base-content/50">
                of {tile.total} approved
              </span>
            </div>
            <progress
              className="progress progress-primary mt-2 h-1.5"
              value={pct}
              max={100}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Current → suggested, with the reason underneath. */
function FixDiff({ row }: { row: FixRow }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      {row.currentValue ? (
        <p className="truncate text-xs text-base-content/45 line-through">
          {row.currentValue}
        </p>
      ) : (
        <p className="text-xs italic text-base-content/40">
          {row.element === "alt" ? "No alt text" : "Currently empty"}
        </p>
      )}
      <p className="text-sm font-medium">{row.suggestedValue}</p>
      <p className="text-xs text-base-content/55">{row.reason}</p>
      {row.element === "alt" && row.target ? (
        <p className="truncate text-[11px] text-base-content/40">{row.target}</p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: FixRow["status"] }) {
  if (status === "approved") {
    return <span className="badge badge-success badge-sm">Approved</span>;
  }
  if (status === "excluded") {
    return <span className="badge badge-ghost badge-sm">Excluded</span>;
  }
  return null;
}

/** One suggestion, with approve / exclude controls. */
export function FixRowView({
  row,
  onApprove,
  onExclude,
  busy,
}: {
  row: FixRow;
  onApprove: () => void;
  onExclude: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-base-200 py-2.5 first:border-t-0">
      <span className="mt-0.5 w-10 shrink-0 text-[11px] font-medium uppercase text-base-content/40">
        {ELEMENT_TAG[row.element]}
      </span>
      <FixDiff row={row} />
      <div className="flex shrink-0 items-center gap-1.5">
        {row.source === "ai" ? (
          <span className="badge badge-outline badge-sm">AI</span>
        ) : null}
        <StatusPill status={row.status} />
        <button
          type="button"
          className={`btn btn-xs btn-circle ${
            row.status === "approved" ? "btn-success" : "btn-ghost"
          }`}
          disabled={busy}
          onClick={onApprove}
          aria-label="Approve"
          title="Approve"
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          className={`btn btn-xs btn-circle ${
            row.status === "excluded" ? "btn-active" : "btn-ghost"
          }`}
          disabled={busy}
          onClick={onExclude}
          aria-label="Exclude"
          title="Exclude"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** All the fixes for one page, in a card. */
export function PageGroupCard({
  group,
  onApprove,
  onExclude,
  onApprovePage,
  busy,
}: {
  group: PageGroup;
  onApprove: (id: string) => void;
  onExclude: (id: string) => void;
  onApprovePage: (ids: string[]) => void;
  busy: boolean;
}) {
  const pendingIds = group.rows
    .filter((row) => row.status === "pending")
    .map((row) => row.id);

  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold" title={group.url}>
          {group.path}
        </h3>
        {pendingIds.length > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={busy}
            onClick={() => onApprovePage(pendingIds)}
          >
            Approve all {pendingIds.length}
          </button>
        ) : (
          <span className="text-xs text-base-content/40">All decided</span>
        )}
      </div>
      <div className="mt-1">
        {group.rows.map((row) => (
          <FixRowView
            key={row.id}
            row={row}
            busy={busy}
            onApprove={() => onApprove(row.id)}
            onExclude={() => onExclude(row.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** The status filter as a daisyUI join. */
export function StatusFilter({
  value,
  onChange,
  counts,
}: {
  value: "all" | FixRow["status"];
  onChange: (value: "all" | FixRow["status"]) => void;
  counts: { all: number; pending: number; approved: number; excluded: number };
}) {
  const options: Array<{ key: "all" | FixRow["status"]; label: string }> = [
    { key: "all", label: `All (${counts.all})` },
    { key: "pending", label: `Pending (${counts.pending})` },
    { key: "approved", label: `Approved (${counts.approved})` },
    { key: "excluded", label: `Excluded (${counts.excluded})` },
  ];
  return (
    <div className="join">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`btn btn-xs join-item ${
            value === option.key ? "btn-active" : "btn-ghost"
          }`}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Recommended-fixes headline, mirroring the sample report's framing. */
export function RecommendedFixesBanner({
  total,
  elements,
}: {
  total: number;
  elements: OnPageElement[];
}) {
  if (total === 0) return null;
  const label = elements.map((element) => ELEMENT_LABEL[element]).join(", ");
  return (
    <p className="text-sm text-base-content/70">
      We found <span className="font-semibold">{total}</span> recommended fixes
      across {label.toLowerCase()}. Approve the ones you want, exclude the rest —
      approved fixes flow into your client report.
    </p>
  );
}
