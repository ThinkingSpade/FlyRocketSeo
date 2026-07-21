import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";

/**
 * The current project's domain, for tabs that should offer to analyze the
 * user's own site instead of opening as a bare form. Shares the dashboard's
 * `["projects"]` cache entry, so it costs nothing extra.
 */
export function useProjectDomain(projectId: string): string | null {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 60_000,
  });

  const domain = projectsQuery.data?.find(
    (project) => project.id === projectId,
  )?.domain;
  return domain?.trim() ? domain : null;
}
