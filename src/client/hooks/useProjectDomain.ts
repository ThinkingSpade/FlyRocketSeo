import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";

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

/** The US default every call site used before the project's own market was
 *  reachable. Still the fallback while `["projects"]` is in flight. */
const DEFAULT_MARKET = { locationCode: 2840, languageCode: "en" } as const;

/**
 * The project's configured market, for tabs whose location/language selects
 * should default to what onboarding asked for rather than to the US.
 * Shares the `["projects"]` cache entry, so it costs nothing extra.
 */
export function useProjectMarket(projectId: string): {
  locationCode: number;
  languageCode: string;
} {
  const project = useProject(projectId);
  if (!project) return DEFAULT_MARKET;
  return {
    locationCode: project.locationCode,
    languageCode: project.languageCode,
  };
}
