import { AlertCircle, RefreshCw } from "lucide-react";

export function InlineQueryError({
  message,
  onRetry,
  retrying = false,
  className = "",
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2 text-sm ${className}`}
    >
      <AlertCircle className="size-4 shrink-0 text-base-content/45" />
      <span className="min-w-0 flex-1 text-base-content/70">{message}</span>
      <button
        type="button"
        className="btn btn-ghost btn-xs gap-1"
        disabled={retrying}
        onClick={onRetry}
      >
        <RefreshCw
          className={`size-3.5 text-base-content/45 ${retrying ? "animate-spin" : ""}`}
        />
        Retry
      </button>
    </div>
  );
}
