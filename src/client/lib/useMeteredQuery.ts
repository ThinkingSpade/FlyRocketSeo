import { useCallback, useState } from "react";
import {
  useQuery,
  type DefaultError,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

const METERED_QUERY_GC_TIME_MS = 60 * 60_000;

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
  | "staleTime"
> & {
  authorized?: boolean;
  enabled?: boolean;
  gcTime?: number;
  runNonce?: number;
};

/**
 * Safe-by-default query wrapper for paid DataForSEO requests.
 *
 * `authorized` must come from an explicit user action in this mounted session.
 * URL state, restored runs, and cached history may prefill inputs but must never
 * set it to true.
 */
export function useMeteredQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
>(
  options: MeteredQueryOptions<TQueryFnData, TError, TData>,
): UseQueryResult<TData, TError> {
  const {
    authorized = false,
    enabled = true,
    gcTime = METERED_QUERY_GC_TIME_MS,
    runNonce,
    ...queryOptions
  } = options;
  const queryKey = withMeteredRunNonce(queryOptions.queryKey, runNonce);

  return useQuery({
    ...queryOptions,
    queryKey,
    enabled: isMeteredQueryEnabled(authorized, enabled),
    staleTime: Infinity,
    gcTime,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
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
