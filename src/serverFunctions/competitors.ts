import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  competitorsListRequestSchema,
  keywordGapRequestSchema,
  linkGapRequestSchema,
  projectCompetitorListRequestSchema,
  projectCompetitorSetRequestSchema,
  projectCompetitorRemoveRequestSchema,
} from "@/types/schemas/competitors";
import { CompetitorsService } from "@/server/features/competitors/services/CompetitorsService";
import { ProjectCompetitorRepository } from "@/server/features/competitors/repositories/ProjectCompetitorRepository";

export const getCompetitorsList = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(competitorsListRequestSchema)
  .handler(async ({ data, context }) => {
    return CompetitorsService.getCompetitors(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });

export const getKeywordGapPage = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(keywordGapRequestSchema)
  .handler(async ({ data, context }) => {
    return CompetitorsService.getKeywordGap(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });

export const getLinkGapPage = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(linkGapRequestSchema)
  .handler(async ({ data, context }) => {
    return CompetitorsService.getLinkGap(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });

/**
 * @knipEntryPending No caller yet -- Task 9 of
 * docs/superpowers/plans/2026-08-10-smart-competitors.md ("Surface the new
 * answer in the table"), Step 3, wires this up as a pin/unpin row action.
 * Remove this tag once THIS export has a real caller; remove the matching
 * `"tags": ["-knipEntryPending"]` entry in knip.jsonc only once none of
 * listProjectCompetitors/setProjectCompetitor/removeProjectCompetitor still
 * carries it.
 */
export const listProjectCompetitors = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectCompetitorListRequestSchema)
  .handler(async ({ context }) => {
    return ProjectCompetitorRepository.listByProject(context.projectId);
  });

/**
 * @knipEntryPending No caller yet -- Task 9 of
 * docs/superpowers/plans/2026-08-10-smart-competitors.md ("Surface the new
 * answer in the table"), Step 3, wires this up as a pin row action. Remove
 * this tag once THIS export has a real caller; remove the matching
 * `"tags": ["-knipEntryPending"]` entry in knip.jsonc only once none of
 * listProjectCompetitors/setProjectCompetitor/removeProjectCompetitor still
 * carries it.
 */
export const setProjectCompetitor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectCompetitorSetRequestSchema)
  .handler(async ({ data, context }) => {
    await ProjectCompetitorRepository.upsert({
      projectId: context.projectId,
      domain: data.domain,
      status: data.status,
      note: data.note,
    });
    return ProjectCompetitorRepository.listByProject(context.projectId);
  });

/**
 * @knipEntryPending No caller yet -- Task 9 of
 * docs/superpowers/plans/2026-08-10-smart-competitors.md ("Surface the new
 * answer in the table"), Step 3, wires this up as an exclude row action.
 * Remove this tag once THIS export has a real caller; remove the matching
 * `"tags": ["-knipEntryPending"]` entry in knip.jsonc only once none of
 * listProjectCompetitors/setProjectCompetitor/removeProjectCompetitor still
 * carries it.
 */
export const removeProjectCompetitor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectCompetitorRemoveRequestSchema)
  .handler(async ({ data, context }) => {
    await ProjectCompetitorRepository.remove({
      projectId: context.projectId,
      domain: data.domain,
    });
    return ProjectCompetitorRepository.listByProject(context.projectId);
  });
