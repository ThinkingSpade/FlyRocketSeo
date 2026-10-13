import type { Opportunity, OpportunityStatus } from "@/shared/opportunities";
import { GSC_DEVICES } from "@/types/schemas/search-performance";
export const statusLabels: Record<OpportunityStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  implemented: "Implemented",
  results_pending: "Results pending",
  measured: "Measured",
  dismissed: "Dismissed",
};
export const opportunityWorkKey = (
  projectId: string,
  target: string | null,
  page = 0,
  status?: OpportunityStatus,
) => ["opportunity-work", projectId, target, { page, status }] as const;

export function investigationSearch(item: Opportunity) {
  return {
    u: item.url,
    pageView: "evidence" as const,
    startDate: item.evidence.window.startDate,
    endDate: item.evidence.window.endDate,
    country: item.evidence.scope.country ?? undefined,
    device: GSC_DEVICES.find((device) => device === item.evidence.scope.device),
    searchType: item.evidence.scope.searchType,
    dateRange: "last_28_days" as const,
  };
}

export function resultCopy(item: Opportunity) {
  const result = item.result;
  if (!result) return "Results pending";
  if (result.availability !== "measured")
    return `Results ${result.availability}: ${result.limitations.join(" ")}`;
  return `Observed clicks: ${result.baseline.current.clicks} → ${result.after.current.clicks}; impressions: ${result.baseline.current.impressions} → ${result.after.current.impressions}. Association with recorded work, not proof of causation.`;
}
