import { Check, Warning, X } from "@phosphor-icons/react";
import {
  ELEMENT_LABEL,
  type ElementProgress,
  type FixRow,
  type OnPageElement,
  type PageGroup,
} from "@/client/features/onpage/onPageModel";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Button } from "@cloudflare/kumo/components/button";
import { Badge } from "@cloudflare/kumo/components/badge";
import { ProgressBar } from "@/client/components/ProgressBar";

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
            {/* The tile's own caption, not a shared "On-page score": all
                four bars carried the same assistive label, so a screen
                reader heard the same meter four times while the visible
                captions read Page titles / Meta descriptions / H1 headings /
                Image alt text. */}
            <ProgressBar
              className="mt-2"
              value={pct}
              max={100}
              label={`${tile.label} decided`}
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
    <div className="space-y-1">
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
        <p className="truncate text-[11px] text-base-content/40">
          {row.target}
        </p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: FixRow["status"] }) {
  if (status === "approved") {
    return <Badge variant="success">Approved</Badge>;
  }
  if (status === "excluded") {
    return <Badge variant="neutral">Excluded</Badge>;
  }
  return null;
}

/** One suggestion, with approve / exclude controls. */
function FixRowView({
  row,
  offOfferReason,
  onApprove,
  onExclude,
  busy,
}: {
  row: FixRow;
  offOfferReason: string | null;
  onApprove: () => void;
  onExclude: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-base-200 py-2.5 first:border-t-0">
      <span className="mt-0.5 w-10 shrink-0 text-[11px] font-medium uppercase text-base-content/40">
        {ELEMENT_TAG[row.element]}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <FixDiff row={row} />
        {/* Nothing that wrote this text knows what the client sells, so a
            suggestion can cheerfully advertise a service they told us they
            do not offer. Quoting their own exclusion line back makes a
            false positive legible as a wrong exclusion rather than as the
            tool being broken. */}
        {offOfferReason ? (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <Warning className="mt-0.5 size-3.5 shrink-0" />
            {offOfferReason}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {row.source === "ai" ? <Badge variant="outline">AI</Badge> : null}
        <StatusPill status={row.status} />
        {/* Both are toggles, so the chosen state is `aria-pressed` rather
            than a colour class. Kumo has no "success" variant; approving is
            the affirmative action here, so it takes `primary`. */}
        <Button
          type="button"
          shape="circle"
          size="xs"
          variant={row.status === "approved" ? "primary" : "ghost"}
          aria-pressed={row.status === "approved"}
          disabled={busy}
          onClick={onApprove}
          aria-label="Approve"
          title="Approve"
        >
          <Check className="size-3.5" />
        </Button>
        <Button
          type="button"
          shape="circle"
          size="xs"
          variant={row.status === "excluded" ? "secondary" : "ghost"}
          aria-pressed={row.status === "excluded"}
          disabled={busy}
          onClick={onExclude}
          aria-label="Exclude"
          title="Exclude"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** All the fixes for one page, in a card. */
export function PageGroupCard({
  group,
  offOffer,
  onApprove,
  onExclude,
  onApprovePage,
  busy,
}: {
  group: PageGroup;
  /** Row id → why that suggestion contradicts the client's profile. */
  offOffer: ReadonlyMap<string, string>;
  onApprove: (id: string) => void;
  onExclude: (id: string) => void;
  onApprovePage: (ids: string[]) => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold" title={group.url}>
            {group.path}
          </h3>
          {/* Why this page is where it is in the list. Omitted rather than
              shown as "0 clicks" when Search Console has no row for it —
              which means "not connected" just as often as it means "nobody
              landed here". */}
          {group.clicks != null && group.clicks > 0 ? (
            <span className="shrink-0 text-xs tabular-nums text-base-content/40">
              {group.clicks.toLocaleString()} clicks
            </span>
          ) : null}
        </div>
        {group.pendingIds.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => onApprovePage(group.pendingIds)}
          >
            Approve all {group.pendingIds.length}
          </Button>
        ) : (
          <span className="text-xs text-base-content/40">All decided</span>
        )}
      </div>
      <div className="mt-1">
        {group.rows.map((row) => (
          <FixRowView
            key={row.id}
            row={row}
            offOfferReason={offOffer.get(row.id) ?? null}
            busy={busy}
            onApprove={() => onApprove(row.id)}
            onExclude={() => onExclude(row.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Single-select status filter — a segmented control, not a button group. */
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
    <SegmentedToggle
      showLabels
      items={options.map((option) => ({
        value: option.key,
        label: option.label,
      }))}
      value={value}
      onChange={onChange}
    />
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
      across {label.toLowerCase()}. Approve the ones you want, exclude the rest
      — approved fixes flow into your client report.
    </p>
  );
}
