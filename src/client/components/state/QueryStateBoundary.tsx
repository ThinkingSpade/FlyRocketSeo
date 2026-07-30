import type { ReactNode } from "react";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import type {
  QuerySamplingEvidence,
  QueryState,
} from "@/client/components/state/queryState";

/**
 * Renders exactly one of the five data states, and nothing else.
 *
 * A pure renderer over a resolved `QueryState`. It takes no query object, calls
 * no `refetch`, and starts no request — the only path to a fetch is the user
 * pressing the retry button. That is deliberate: `useMeteredQuery` disables
 * mount/focus/reconnect refetching so a restored page cannot fire a paid call,
 * and a state layer with access to queries would erode that without anyone
 * noticing.
 *
 * The absence rules live here rather than in each caller, because Phase 1 fixed
 * the same mistake in roughly a dozen places: a capped pull is not an absence,
 * so "none found" must not be sayable when completeness was never established.
 */

function formatRows(count: number): string {
  return count.toLocaleString();
}

/**
 * One sentence per capped pull, naming which pull was cut and where.
 *
 * Listed individually rather than merged. Combining them would recreate the
 * server-side bug of pairing one pull's flag with another pull's row count,
 * which cannot produce a true sentence.
 */
function CappedPullNotice({
  pulls,
  className,
}: {
  pulls: readonly QuerySamplingEvidence[];
  className?: string;
}) {
  if (pulls.length === 0) return null;
  return (
    <p className={className ?? "text-xs text-base-content/50"}>
      {pulls.map((pull) => (
        <span key={pull.label} className="block">
          {pull.label} stopped at {formatRows(pull.rowsExamined)} rows, ordered
          by clicks — rows past that were not read.
        </span>
      ))}
    </p>
  );
}

type QueryStateBoundaryProps = {
  state: QueryState;
  /** Shown while `state.kind === "loading"`. Feature-shaped on purpose: a
   *  skeleton that mirrors its own layout beats a generic spinner. */
  loading: ReactNode;
  /** Rendered for `not-connected`. Providers differ enough (GSC OAuth vs a
   *  missing project domain) that the copy and CTA stay with the caller. */
  notConnected?: ReactNode;
  errorMessage: string;
  /** Copy for a zero result the caller can stand behind. Suppressed
   *  automatically when absence was never established. */
  emptyTitle: string;
  emptyBody?: string;
  /** Distinct copy for "your filters excluded everything", which is a different
   *  fact from "there is nothing". */
  filteredTitle?: string;
  filteredBody?: string;
  children: ReactNode;
};

export function QueryStateBoundary({
  state,
  loading,
  notConnected,
  errorMessage,
  emptyTitle,
  emptyBody,
  filteredTitle,
  filteredBody,
  children,
}: QueryStateBoundaryProps) {
  if (state.kind === "loading") return <>{loading}</>;

  if (state.kind === "error") {
    return (
      <InlineQueryError
        message={errorMessage}
        retrying={state.retry?.pending ?? false}
        onRetry={state.retry?.onRetry}
        // Naming the cost on the control itself is the fix for a refresh icon
        // that meant "free" on one page and "spends credits" on another.
        retryLabel={
          state.retry?.cost === "credits" ? "Run again · uses credits" : "Retry"
        }
      />
    );
  }

  if (state.kind === "not-connected") return <>{notConnected ?? null}</>;

  if (state.kind === "empty") {
    const filtered = state.reason === "filtered-zero";

    // Completeness was never established, so the caller's absence sentence is
    // replaced rather than decorated. Appending a caveat to "No cannibalization
    // detected — that's a healthy site" would leave the false claim on screen.
    if (!state.absenceEstablished) {
      return (
        <div className="p-6 text-center">
          <p className="text-sm font-medium">
            {filtered
              ? "No filtered matches in the rows we read"
              : "Nothing found in the rows we read"}
          </p>
          <CappedPullNotice
            pulls={state.cappedPulls}
            className="mx-auto mt-1 max-w-md text-sm text-base-content/60"
          />
          {state.cappedPulls.length === 0 ? (
            <p className="mx-auto mt-1 max-w-md text-sm text-base-content/60">
              How much was searched isn&rsquo;t known, so this isn&rsquo;t a
              confirmed absence.
            </p>
          ) : null}
        </div>
      );
    }

    return (
      <div className="p-6 text-center">
        <p className="text-sm font-medium">
          {filtered ? (filteredTitle ?? emptyTitle) : emptyTitle}
        </p>
        {(filtered ? (filteredBody ?? emptyBody) : emptyBody) ? (
          <p className="mx-auto mt-1 max-w-md text-sm text-base-content/60">
            {filtered ? (filteredBody ?? emptyBody) : emptyBody}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <CappedPullNotice pulls={state.cappedPulls} />
      {children}
    </>
  );
}
