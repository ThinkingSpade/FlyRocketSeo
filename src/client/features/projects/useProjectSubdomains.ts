import { useQuery } from "@tanstack/react-query";
import { buildProjectHostOptions } from "@/client/features/projects/projectHostOptions";
import { getProjectSubdomains } from "@/serverFunctions/projectSubdomains";

/** One stored subdomain, as the server function returns it. */
export type ProjectSubdomain = Awaited<
  ReturnType<typeof getProjectSubdomains>
>["subdomains"][number];

/**
 * The one query key for a project's subdomain list.
 *
 * Shared by the settings section that edits the list and every consumer that
 * reads it, so an edit in settings invalidates the copy the Site Audit and Rank
 * Tracking pickers are showing rather than leaving them on a stale list.
 */
export function projectSubdomainsQueryKey(projectId: string) {
  return ["project-subdomains", projectId] as const;
}

/** Long enough that opening a picker never refetches mid-session; the settings
 *  section invalidates the key directly whenever the list actually changes. */
const STALE_TIME = 5 * 60_000;

export function useProjectSubdomainsQuery(projectId: string) {
  return useQuery({
    queryKey: projectSubdomainsQueryKey(projectId),
    queryFn: () => getProjectSubdomains({ data: { projectId } }),
    staleTime: STALE_TIME,
  });
}

/** The project's suggestable hosts. See {@link buildProjectHostOptions} for the
 *  rule itself, which is unit-tested separately from this hook. */
export function useProjectHostOptions(projectId: string): string[] {
  const { data } = useProjectSubdomainsQuery(projectId);
  return buildProjectHostOptions(data?.apex ?? null, data?.subdomains ?? []);
}
