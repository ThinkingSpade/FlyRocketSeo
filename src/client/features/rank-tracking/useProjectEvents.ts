import { useQuery } from "@tanstack/react-query";
import { getProjectEvents } from "@/serverFunctions/project-events";

export function projectEventsQueryKey(projectId: string) {
  return ["projectEvents", projectId] as const;
}

/** All events for the project (newest first). Shared by the overview chart,
 * the keyword trend modal, and the events manager — one cache entry. */
export function useProjectEvents(projectId: string) {
  return useQuery({
    queryKey: projectEventsQueryKey(projectId),
    queryFn: () => getProjectEvents({ data: { projectId } }),
  });
}
