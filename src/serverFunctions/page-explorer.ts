import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { pageExplorerRequestSchema } from "@/types/schemas/page-explorer";
import { PageExplorerService } from "@/server/features/page-explorer/services/PageExplorerService";

export const getPageExplorer = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(pageExplorerRequestSchema)
  .handler(async ({ data, context }) => {
    return PageExplorerService.getPageExplorer(
      {
        ...data,
        projectId: context.projectId,
      },
      context,
    );
  });
