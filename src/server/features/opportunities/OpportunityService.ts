import { getPagePerformance } from "@/server/features/page-explorer/services/pagePerformance";
import { AppError } from "@/server/lib/errors";
import type { OpportunityFinding } from "@/shared/opportunities";
import type {
  SavePageOpportunityInput,
  UpdateOpportunityInput,
  MeasureOpportunityInput,
} from "@/types/schemas/opportunities";
import { pageInvestigationInputSchema } from "@/types/schemas/page-investigation";
import { OpportunityRepository } from "./OpportunityRepository";
import { list, refresh } from "./declineRefresh";
import {
  scoped,
  snapshotFromPage,
  persistFinding,
  retainEvidence,
  type OpportunityContext,
} from "./opportunityEvidence";
async function savePage(
  input: SavePageOpportunityInput,
  context: OpportunityContext,
) {
  const report = await getPagePerformance(
    { ...input, projectId: context.projectId },
    context.project.domain,
  );
  if (!report.connected)
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect an available Search Console property before saving measured page evidence.",
    );
  const evidence = snapshotFromPage(report, context);
  if (!evidence.coverage.complete || !evidence.coverage.currentRows)
    throw new AppError(
      "VALIDATION_ERROR",
      "Save an action after a complete observed page window is available.",
    );
  const finding: OpportunityFinding = {
    kind: "page_review",
    title: "Investigate page performance",
    finding: `Review ${evidence.current.clicks} observed clicks and ${evidence.current.impressions} impressions alongside page content and technical evidence.`,
    url: input.url,
    assetRefs: [input.url],
    priorityBand: "low",
    confidenceBand: "medium",
    limitations: evidence.limitations,
    nextSteps: [
      "Review query intent and captured page evidence.",
      "Prepare and review a proposed change before implementation.",
    ],
    evidence,
  };
  return persistFinding(finding, context, "page-review", {
    queries: report.queries,
    coverage: report.coverage,
  });
}
async function update(
  input: UpdateOpportunityInput,
  context: OpportunityContext,
) {
  return OpportunityRepository.update(
    scoped(context),
    input.opportunityId,
    input.expectedRevision,
    input,
    context.userId,
  );
}
async function measure(
  input: MeasureOpportunityInput,
  context: OpportunityContext,
) {
  const task = await OpportunityRepository.get(
    scoped(context),
    input.opportunityId,
  );
  if (!task) throw new AppError("NOT_FOUND");
  const baseline = await OpportunityRepository.getBaseline(
    scoped(context),
    input.opportunityId,
  );
  if (!baseline || !task.implementedAt)
    throw new AppError(
      "VALIDATION_ERROR",
      "Record implementation before measuring outcomes.",
    );
  if (task.revision !== input.expectedRevision) throw new AppError("CONFLICT");
  const request = pageInvestigationInputSchema.parse({
    projectId: context.projectId,
    url: baseline.url,
    startDate: input.startDate,
    endDate: input.endDate,
    country: baseline.scope.country ?? undefined,
    device: baseline.scope.device ?? undefined,
    searchType: baseline.scope.searchType,
  });
  const report = await getPagePerformance(request, context.project.domain);
  if (!report.connected)
    throw new AppError(
      "VALIDATION_ERROR",
      "Search Console evidence is currently unavailable.",
    );
  const after = snapshotFromPage(report, context);
  return retainEvidence(
    after,
    {
      queries: report.queries,
      coverage: report.coverage,
    },
    (afterSnapshotId) =>
      OpportunityRepository.storeMeasurement(
        scoped(context),
        input.opportunityId,
        input.expectedRevision,
        afterSnapshotId,
        context.userId,
      ),
  );
}
export const OpportunityService = {
  list,
  refresh,
  savePage,
  update,
  measure,
  listAssignees: (context: OpportunityContext) =>
    OpportunityRepository.listAssignees(context.organizationId),
};
