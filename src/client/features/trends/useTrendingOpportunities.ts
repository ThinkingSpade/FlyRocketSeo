import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getQueryMomentum,
  type QueryMomentumResult,
} from "@/serverFunctions/trendingOpportunities";
import {
  useKeywordFit,
  useProjectProfile,
} from "@/client/features/profiles/useProjectProfile";
import { computeQueryMomentum } from "./queryMomentum";
import {
  buildTrendingOpportunities,
  type TrendingOpportunity,
} from "./opportunityActions";

/**
 * The ranked action list behind the Keyword Trends tab.
 *
 * Every input is free: two unmetered Search Console reads plus pure
 * client-side classification over the rows they return. That is what lets
 * this load on mount, while the comparison chart below it -- which costs
 * $0.011 a call -- stays behind an explicit submit.
 */

const MOMENTUM_STALE_MS = 5 * 60_000;

type ConnectedMomentum = Extract<QueryMomentumResult, { connected: true }>;

type TrendingOpportunitiesState = {
  opportunities: TrendingOpportunity[];
  isLoading: boolean;
  /** Search Console isn't connected, or the read failed. */
  unavailable: boolean;
  /** The prior pull may have been clipped, so some rows lack a baseline for a
   *  reason other than genuinely having none. */
  priorPeriodTruncated: boolean;
  /** The current pull may have been clipped. Search Console orders rows by
   *  CLICKS while this list ranks by impressions, so a clipped pull is a
   *  biased sample, not merely a short one. */
  currentPeriodTruncated: boolean;
  /** Connected and read successfully, but nothing met the bar. Distinct from
   *  unavailable so the card can explain instead of vanishing. */
  empty: boolean;
};

export function useTrendingOpportunities(
  projectId: string,
): TrendingOpportunitiesState {
  const query = useQuery({
    queryKey: ["queryMomentum", projectId, "last_28_days"],
    queryFn: () =>
      getQueryMomentum({ data: { projectId, dateRange: "last_28_days" } }),
    staleTime: MOMENTUM_STALE_MS,
  });

  const { profile } = useProjectProfile(projectId);
  // Narrowing only works because `getQueryMomentum`'s handler carries an
  // explicit `QueryMomentumResult` return type. Without it `createServerFn`
  // widens the two branches into one optional-everything object and every
  // read below silently becomes `| undefined`.
  const raw = query.data;
  const data: ConnectedMomentum | null =
    raw !== undefined && raw.connected ? raw : null;

  const keywords = useMemo(
    () => (data?.current ?? []).map((row) => row.query),
    [data],
  );
  const fit = useKeywordFit(profile, keywords);

  const opportunities = useMemo(() => {
    if (!data) return [];

    const momentum = computeQueryMomentum({
      current: data.current,
      previous: data.previous,
      previousTruncated: data.previousTruncated,
    });
    const byQuery = new Map(momentum.map((row) => [row.query, row]));

    return buildTrendingOpportunities({
      candidates: data.current.flatMap((row) => {
        const own = byQuery.get(row.query);
        if (!own) return [];
        return [
          {
            keyword: row.query,
            momentum: own,
            position: row.position,
            page: row.page,
            pageShare: row.pageShare,
          },
        ];
      }),
      fit,
    });
  }, [data, fit]);

  return {
    opportunities,
    isLoading: query.isLoading,
    unavailable: query.isError || query.data?.connected === false,
    priorPeriodTruncated: data?.previousTruncated ?? false,
    currentPeriodTruncated: data?.currentTruncated ?? false,
    empty: data !== null && opportunities.length === 0,
  };
}
