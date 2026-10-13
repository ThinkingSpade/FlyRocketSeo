import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { pageInvestigationInputSchema } from "@/types/schemas/page-investigation";
import { getPagePerformance } from "@/server/features/page-explorer/services/pagePerformance";

export const getPageInvestigationPerformance = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(pageInvestigationInputSchema)
  .handler(({ data, context }) =>
    getPagePerformance(
      { ...data, projectId: context.projectId },
      context.project.domain,
    ),
  );
