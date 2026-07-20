import { useQuery } from "@tanstack/react-query";
import { getLinkInsights } from "@/serverFunctions/link-insights";

/** Shared fetch for Link Opportunities + Cannibalization — one query key, so
 *  visiting both pages costs a single GSC scan. */
export function useLinkInsights(projectId: string) {
  return useQuery({
    queryKey: ["link-insights", projectId],
    queryFn: () => getLinkInsights({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });
}

export function toPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}
