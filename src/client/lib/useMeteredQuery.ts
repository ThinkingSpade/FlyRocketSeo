import { useCallback, useState } from "react";
import {
  useQuery,
  type DefaultError,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

const METERED_QUERY_GC_TIME_MS = 60 * 60_000;

export type MeteredQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<
  UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
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
  TQueryKey extends QueryKey = QueryKey,
>(
  options: MeteredQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<TData, TError> {
  const {
    authorized = false,
    enabled = true,
    gcTime = METERED_QUERY_GC_TIME_MS,
    ...queryOptions
  } = options;

  return useQuery({
    ...queryOptions,
    enabled: authorized && enabled,
    staleTime: Infinity,
    gcTime,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

export type AuthorizedRun = {
  authorized: boolean;
  authorize: () => void;
  reset: () => void;
};

export function useAuthorizedRun(): AuthorizedRun {
  const [authorized, setAuthorized] = useState(false);
  const authorize = useCallback(() => setAuthorized(true), []);
  const reset = useCallback(() => setAuthorized(false), []);

  return { authorized, authorize, reset };
}
