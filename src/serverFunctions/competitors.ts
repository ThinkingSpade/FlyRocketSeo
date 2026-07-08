import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  competitorsListRequestSchema,
  keywordGapRequestSchema,
  linkGapRequestSchema,
} from "@/types/schemas/competitors";
import { CompetitorsService } from "@/server/features/competitors/services/CompetitorsService";

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
