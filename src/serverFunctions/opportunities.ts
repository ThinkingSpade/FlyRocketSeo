import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { OpportunityService } from "@/server/features/opportunities/OpportunityService";
import {
  opportunityProjectInputSchema,
  listOpportunitiesInputSchema,
  opportunityHistoryInputSchema,
  refreshOpportunitiesInputSchema,
  savePageOpportunityInputSchema,
  updateOpportunityInputSchema,
  measureOpportunityInputSchema,
  saveInternalLinkOpportunityInputSchema,
} from "@/types/schemas/opportunities";
import { saveInternalLink } from "@/server/features/opportunities/internalLinks";
import { OpportunityRepository } from "@/server/features/opportunities/OpportunityRepository";
import { scoped } from "@/server/features/opportunities/opportunityEvidence";

export const listOpportunities = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listOpportunitiesInputSchema)
  .handler(({ data, context }) => OpportunityService.list(context, data));
export const getOpportunityHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(opportunityHistoryInputSchema)
  .handler(({ data, context }) =>
    OpportunityRepository.history(
      scoped(context),
      data.opportunityId,
      data.beforeRevision,
    ),
  );
export const listOpportunityAssignees = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(opportunityProjectInputSchema)
  .handler(({ context }) => OpportunityService.listAssignees(context));
export const refreshOpportunities = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(refreshOpportunitiesInputSchema)
  .handler(({ data, context }) => OpportunityService.refresh(data, context));
export const savePageOpportunity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(savePageOpportunityInputSchema)
  .handler(({ data, context }) => OpportunityService.savePage(data, context));
export const updateOpportunity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateOpportunityInputSchema)
  .handler(({ data, context }) => OpportunityService.update(data, context));
export const measureOpportunity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(measureOpportunityInputSchema)
  .handler(({ data, context }) => OpportunityService.measure(data, context));
export const saveInternalLinkOpportunity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveInternalLinkOpportunityInputSchema)
  .handler(({ data, context }) => saveInternalLink(data, context));
