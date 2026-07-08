import { History, RotateCw } from "lucide-react";

type DataFreshnessProps = {
  fetchedAt: string | number | Date | null | undefined;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
};

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Days beyond which an absolute date reads better than "N days ago". */
const RELATIVE_TIME_DAY_LIMIT = 30;

/**
 * Human-friendly age of a timestamp: "just now" under a minute, then
 * minutes/hours/days ago, falling back to an absolute date once older than a
 * month.
 */
export function formatRelativeTime(value: string | number | Date): string {
  const date = toDate(value);
  if (!date) return "recently";

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= RELATIVE_TIME_DAY_LIMIT) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Compact "Updated {relative} · Refresh" chip for metered, cached research
 * pages (Domain Overview, Competitors). Surfaces how old the DataForSEO-backed
 * data is and, when `onRefresh` is provided, offers a deliberate refetch that
 * may cost a live request. Renders nothing without a valid timestamp.
 */
export function DataFreshness({
  fetchedAt,
  onRefresh,
  refreshing = false,
  className,
}: DataFreshnessProps) {
  if (fetchedAt == null) return null;
  const date = toDate(fetchedAt);
  if (!date) return null;

  return (
    <div
      className={`flex items-center gap-1.5 text-xs text-base-content/60 ${className ?? ""}`}
    >
      <History className="size-3.5 shrink-0" />
      <span>Updated {formatRelativeTime(date)}</span>
      {onRefresh ? (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="btn btn-ghost btn-xs gap-1 px-1.5 text-base-content/60 hover:text-base-content"
            title="Refresh this data — may use a DataForSEO request"
            aria-label="Refresh data (may use a DataForSEO request)"
          >
            <RotateCw
              className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </>
      ) : null}
    </div>
  );
}
