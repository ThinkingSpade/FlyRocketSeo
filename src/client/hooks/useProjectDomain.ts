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
