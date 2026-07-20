import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  contentBriefRequestSchema,
  contentCompetitorRequestSchema,
} from "@/types/schemas/content";
import { ContentBriefService } from "@/server/features/content/services/ContentBriefService";

export const getContentBrief = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(contentBriefRequestSchema)
  .handler(async ({ data, context }) => {
    return ContentBriefService.getContentBrief(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });

export const analyzeContentCompetitor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(contentCompetitorRequestSchema)
  .handler(async ({ data, context }) => {
    return ContentBriefService.analyzeCompetitorPage(
      {
        projectId: context.projectId,
        url: data.url,
      },
      context,
    );
  });
