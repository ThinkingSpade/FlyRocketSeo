import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { citationTrackerRequestSchema } from "@/types/schemas/citations";
import { CitationTrackerService } from "@/server/features/citations/services/CitationTrackerService";

export const getCitationReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(citationTrackerRequestSchema)
  .handler(async ({ data, context }) => {
    return CitationTrackerService.getCitationReport(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });
