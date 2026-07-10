import { useQuery } from "@tanstack/react-query";
import { getReportBranding } from "@/serverFunctions/report";

export function reportBrandingQueryKey(projectId: string) {
  return ["reportBranding", projectId] as const;
}

/** White-label settings shown in the report header and frozen into shares. */
export function useReportBranding(projectId: string) {
  return useQuery({
    queryKey: reportBrandingQueryKey(projectId),
    queryFn: () => getReportBranding({ data: { projectId } }),
  });
}
