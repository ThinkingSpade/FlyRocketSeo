import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";
import { DEFAULT_LOCATION_CODE } from "@/shared/keyword-locations";

type ProjectSummary = Awaited<ReturnType<typeof getProjects>>[number];

export function useProject(projectId: string): ProjectSummary | null {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 60_000,
  });

  return (
    projectsQuery.data?.find((project) => project.id === projectId) ?? null
  );
}

/**
 * The current project's domain, for tabs that should offer to analyze the
 * user's own site instead of opening as a bare form. Shares the dashboard's
 * `["projects"]` cache entry, so it costs nothing extra.
 */
export function useProjectDomain(projectId: string): string | null {
  const domain = useProject(projectId)?.domain;
  return domain?.trim() ? domain : null;
}

export type ProjectMarket = { locationCode: number; languageCode: string };

/** The US default every call site used before the project's own market was
 *  reachable. Still the fallback while `["projects"]` is in flight.
 *  `locationCode` reuses the product-wide default constant so the two can't
 *  drift apart. There's no equivalent shared constant for `languageCode` —
 *  keyword-locations.ts only lists a language per location, not a single
 *  product-wide default — so it stays a literal here. */
const DEFAULT_MARKET: ProjectMarket = {
  locationCode: DEFAULT_LOCATION_CODE,
  languageCode: "en",
};

/**
 * The project's configured market, for tabs whose location/language selects
 * should default to what onboarding asked for rather than to the US.
 * Shares the `["projects"]` cache entry, so it costs nothing extra.
 *
 * Memoized on the two primitive values rather than on `project` itself, so
 * callers get a stable reference across renders when the market hasn't
 * changed. More tabs are about to consume this hook, and an unstable object
 * landing in a `useEffect` dependency array has already caused a real
 * render loop in this codebase.
 */
export function useProjectMarket(projectId: string): ProjectMarket {
  const project = useProject(projectId);
  const locationCode = project?.locationCode ?? DEFAULT_MARKET.locationCode;
  const languageCode = project?.languageCode ?? DEFAULT_MARKET.languageCode;
  return useMemo(
    () => ({ locationCode, languageCode }),
    [locationCode, languageCode],
  );
}
