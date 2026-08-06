import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@cloudflare/kumo/components/button";

/**
 * Inline error with a retry the user must press.
 *
 * `retryLabel` exists so a retry that SPENDS MONEY can say so on the button. The
 * identical refresh affordance currently means "free refetch" on Domain and
 * "spend credits" on Competitors, which is a design inconsistency that costs
 * real money. It is optional here rather than mandatory only because making it
 * required means classifying all 12 existing callers — that reclassification is
 * its own step, not a drive-by.
 */
export function InlineQueryError({
  message,
  onRetry,
  retrying = false,
  retryLabel = "Retry",
  className = "",
}: {
  message: string;
  /** Omit to show the message with no retry affordance at all — better than a
   *  button that cannot do anything. */
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2 text-sm ${className}`}
    >
      <AlertCircle className="size-4 shrink-0 text-base-content/45" />
      <span className="min-w-0 flex-1 text-base-content/70">{message}</span>
      {onRetry ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={retrying}
          onClick={onRetry}
        >
          <RefreshCw
            className={`size-3.5 text-base-content/45 ${retrying ? "animate-spin" : ""}`}
          />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
