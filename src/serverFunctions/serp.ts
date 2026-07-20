import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { serpOverviewRequestSchema } from "@/types/schemas/serp";
import { SerpOverviewService } from "@/server/features/serp/services/SerpOverviewService";

export const getSerpOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(serpOverviewRequestSchema)
  .handler(async ({ data, context }) => {
    return SerpOverviewService.getSerpOverview(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });
