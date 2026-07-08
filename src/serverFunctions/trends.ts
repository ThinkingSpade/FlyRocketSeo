import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { keywordTrendsRequestSchema } from "@/types/schemas/trends";
import { TrendsService } from "@/server/features/trends/services/TrendsService";

export const getKeywordTrends = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(keywordTrendsRequestSchema)
  .handler(async ({ data, context }) => {
    return TrendsService.getTrends(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });
