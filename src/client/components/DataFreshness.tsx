import { History, RotateCw } from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";

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
function formatRelativeTime(value: string | number | Date): string {
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
 * Compact "Cached {relative} · Refresh" chip for metered research pages
 * (Domain Overview, Competitors, Backlinks).
 *
 * It says "Cached", not "Updated", because that is what the number means. Every
 * one of these surfaces reads a server-side R2 cache before it will spend, so
 * the figures on screen are a stored answer with an age — not a live reading.
 *
 * That wording also explains a behaviour that otherwise looks broken: pressing
 * Refresh inside the cache window returns the SAME data and the timestamp does
 * not move. `fetchedAt` is stored inside the cached payload, so a cache hit
 * replays the original time. Users could already see the timestamp sitting
 * still; nothing told them why.
 *
 * Deliberately no specific window in the copy. The TTLs differ per surface —
 * 6h for backlinks, 12h for domain overview and competitors, 24h for rank
 * history — and they live in server constants. A number duplicated here would
 * drift the first time one of them changed, and a confidently wrong "cached for
 * 6 hours" is worse than an honest "cached".
 *
 * Renders nothing without a valid timestamp.
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
      {/* The exact time on hover: "3 hours ago" is the right density for a chip,
          but someone comparing two runs needs the real timestamp. */}
      <span title={date.toLocaleString()}>
        Cached {formatRelativeTime(date)}
      </span>
      {onRefresh ? (
        <>
          <span aria-hidden="true">·</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onRefresh}
            disabled={refreshing}
            className="px-1.5 text-base-content/60 hover:text-base-content"
            // Kumo renders `title` as a real Tooltip rather than the native
            // attribute, so this sentence is now readable styled text instead
            // of an OS tooltip that truncates. The aria-label stays separate
            // and shorter — a screen reader should not have to sit through the
            // caching caveat to learn what the button does.
            title="Check for newer data. Results are cached, so refreshing soon after a run returns the same figures and the time above will not change."
            aria-label="Check for newer data. Results are cached, so refreshing soon after a run returns the same figures."
          >
            <RotateCw
              className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </>
      ) : null}
    </div>
  );
}
