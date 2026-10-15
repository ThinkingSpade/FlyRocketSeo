import { useCallback, useState } from "react";
import {
  useQuery,
  type DefaultError,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

type MeteredQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
> = Omit<
  UseQueryOptions<TQueryFnData, TError, TData>,
  | "enabled"
  | "gcTime"
  | "refetchOnMount"
  | "refetchOnReconnect"
  | "refetchOnWindowFocus"
  | "retry"
  | "retryOnMount"
  | "staleTime"
> & {
  authorized?: boolean;
  enabled?: boolean;
  runNonce?: number;
};

/**
 * Safe-by-default query wrapper for paid DataForSEO requests.
 *
 * `authorized` must come from an explicit user action in this mounted session.
 * URL state, restored runs, and cached history may prefill inputs but must never
 * set it to true.
 *
 * Every automatic re-request path is closed here, including retries. TanStack
 * retries browser queries three times by default, which turns one click into up
 * to four server-function invocations, and each one can reach the metered
 * provider independently -- a failure at or after the provider call is billed
 * every time. `retry` is omitted from the options type so a call site cannot
 * re-open that path; a failed paid query surfaces its error and waits for the
 * user to ask again. `retryOnMount` is closed for the same reason: by default
 * TanStack re-runs a query sitting in error with no data whenever an observer
 * attaches to it -- a remount, or a component switching its key back to that
 * query (say, returning to the search tab whose paid run failed).
 *
 * `gcTime` is Infinity, and not configurable, for the same reason: an enabled
 * observer that finds nothing cached fetches. A paid result that could be
 * garbage-collected would be silently re-bought by coming back to the view
 * still authorized for it (a search tab, a sort, a card) after gcTime. A
 * result the user paid for is kept for the life of the page instead.
 */
export function useMeteredQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
>(
  options: MeteredQueryOptions<TQueryFnData, TError, TData>,
): UseQueryResult<TData, TError> {
  return useQuery(buildMeteredQueryOptions(options));
}

/**
 * The options `useMeteredQuery` hands to `useQuery`. Split out as a pure
 * function so the safety invariants -- never enabled without authorization,
 * never refetched automatically, never retried -- can be asserted directly;
 * this project's vitest runs in a `node` environment and cannot render hooks.
 */
export function buildMeteredQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
>(options: MeteredQueryOptions<TQueryFnData, TError, TData>) {
  const {
    authorized = false,
    enabled = true,
    runNonce,
    ...queryOptions
  } = options;

  return {
    ...queryOptions,
    queryKey: withMeteredRunNonce(queryOptions.queryKey, runNonce),
    enabled: isMeteredQueryEnabled(authorized, enabled),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 0,
    retryOnMount: false,
  } as const satisfies UseQueryOptions<TQueryFnData, TError, TData>;
}

type AuthorizedRun = {
  authorized: boolean;
  runNonce: number;
  authorize: (keyOverride?: string) => void;
  reset: () => void;
};

type AuthorizedRunState = {
  authorizedKey: string | null;
  runNonce: number;
};

export const INITIAL_AUTHORIZED_RUN_STATE: AuthorizedRunState = {
  authorizedKey: null,
  runNonce: 0,
};

export function createMeteredRunKey(...parts: unknown[]): string {
  return JSON.stringify(parts);
}

export function authorizeRunState(
  state: AuthorizedRunState,
  currentKey: string,
): AuthorizedRunState {
  return {
    authorizedKey: currentKey,
    runNonce: state.runNonce + 1,
  };
}

export function isRunAuthorized(
  state: AuthorizedRunState,
  currentKey: string,
): boolean {
  return state.authorizedKey === currentKey;
}

export function isMeteredQueryEnabled(
  authorized: boolean,
  enabled = true,
): boolean {
  return authorized && enabled;
}

export function withMeteredRunNonce(
  queryKey: QueryKey,
  runNonce?: number,
): QueryKey {
  return runNonce == null
    ? queryKey
    : [...queryKey, { meteredRunNonce: runNonce }];
}

export function useAuthorizedRun(currentKey: string): AuthorizedRun {
  const [state, setState] = useState<AuthorizedRunState>(
    INITIAL_AUTHORIZED_RUN_STATE,
  );
  const authorize = useCallback(
    (keyOverride?: string) => {
      setState((previous) =>
        authorizeRunState(previous, keyOverride ?? currentKey),
      );
    },
    [currentKey],
  );
  const reset = useCallback(
    () =>
      setState((previous) => ({
        authorizedKey: null,
        runNonce: previous.runNonce,
      })),
    [],
  );

  return {
    authorized: isRunAuthorized(state, currentKey),
    runNonce: state.runNonce,
    authorize,
    reset,
  };
}
