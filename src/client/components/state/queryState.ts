/**
 * The one place that decides which state a data-backed surface is in.
 *
 * Pure on purpose. It takes plain facts and returns a variant — it never
 * receives a `UseQueryResult`, never calls `refetch`, and never touches query
 * options. `useMeteredQuery` (35 call sites) disables mount/focus/reconnect
 * refetching so a restored page cannot fire a paid request; a state layer that
 * reached into queries would undo that quietly.
 *
 * Phase 1 fixed the same two branch-order bugs on page after page:
 *
 * - a failed query rendered as an empty result, telling the user nothing exists
 *   when nothing was read;
 * - an absence claim derived from a capped pull, where "none found" meant "none
 *   in the first 1,000 rows, ordered by clicks".
 *
 * Both are prevented structurally here rather than by remembering to check.
 * `error` and `empty` are variants of one union, so they cannot both be true,
 * and `absenceEstablished` is computed from per-pull evidence rather than passed
 * in as a hopeful boolean.
 */

type ActionCost = "free" | "credits";

export type QueryRetryAction = Readonly<{
  onRetry: () => void;
  pending: boolean;
  /** Whether pressing this spends money. The identical refresh control used to
   *  mean "free refetch" on one page and "spend credits" on another. */
  cost: ActionCost;
}>;

/**
 * How complete ONE upstream pull was.
 *
 * Per-pull, never a combined boolean. The server learned this the hard way: a
 * truncation flag from one request paired with a row count from another cannot
 * produce an honest sentence, because the number describes a pull that did not
 * stop. `label` is the subject phrase so the copy can name which pull was cut.
 */
export type QuerySamplingEvidence = Readonly<{
  label: string;
  truncated: boolean;
  rowsExamined: number;
}>;

type QueryStateInput = Readonly<{
  isPending: boolean;
  isError: boolean;
  /** `true`/`false` only from an explicit provider response. `undefined` means
   *  "never told", which is NOT a disconnection. */
  connected?: boolean | undefined;
  rowCount: number;
  /** The zero is the result of the user's own filters, not of the data. */
  filtered?: boolean;
  /** A background refresh over usable data. Deliberately separate from
   *  `isPending`: it must not blank a populated page. */
  isFetching?: boolean;
  retry?: QueryRetryAction;
  sampling?: readonly QuerySamplingEvidence[];
}>;

export type QueryState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; retry?: QueryRetryAction }>
  | Readonly<{ kind: "not-connected" }>
  | Readonly<{
      kind: "empty";
      reason: "genuine-zero" | "filtered-zero";
      /** False whenever completeness was not proven. The caller's ordinary
       *  absence sentence must be suppressed when this is false. */
      absenceEstablished: boolean;
      cappedPulls: readonly QuerySamplingEvidence[];
    }>
  | Readonly<{
      kind: "ready";
      cappedPulls: readonly QuerySamplingEvidence[];
    }>;

function cappedPullsOf(
  sampling: readonly QuerySamplingEvidence[] | undefined,
): readonly QuerySamplingEvidence[] {
  return (sampling ?? []).filter((pull) => pull.truncated);
}

/**
 * Resolve exactly one state, in a fixed precedence.
 *
 * loading → error → not-connected → empty → ready. Each earlier state is a
 * reason the later ones cannot be trusted: a pending query has no rows yet, a
 * failed one has no rows *because it failed*, and a disconnected provider has no
 * rows because there is nothing to read.
 */
export function resolveQueryState(input: QueryStateInput): QueryState {
  if (input.isPending) return { kind: "loading" };

  // Before emptiness, always. A failure that also has zero rows is a failure.
  if (input.isError) {
    return input.retry
      ? { kind: "error", retry: input.retry }
      : { kind: "error" };
  }

  // Only an explicit `false` counts. Missing data is not a disconnection.
  if (input.connected === false) return { kind: "not-connected" };

  const cappedPulls = cappedPullsOf(input.sampling);

  if (input.rowCount === 0) {
    // Absence requires positive evidence of completeness. No evidence at all is
    // treated as not-established, matching `pullWasTruncated` on the server:
    // over-claiming absence is the failure mode that reaches the user.
    const absenceEstablished =
      (input.sampling?.length ?? 0) > 0 && cappedPulls.length === 0;
    return {
      kind: "empty",
      reason: input.filtered ? "filtered-zero" : "genuine-zero",
      absenceEstablished,
      cappedPulls,
    };
  }

  return { kind: "ready", cappedPulls };
}
