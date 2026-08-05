import { createServerFn } from "@tanstack/react-start";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import {
  PORTFOLIO_PAGE_SIZE_DEFAULT,
  PORTFOLIO_PAGE_SIZE_MAX,
} from "@/server/features/projects/services/portfolio";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import {
  archiveProjectSchema,
  createProjectSchema,
  restoreProjectSchema,
  updateProjectSchema,
} from "@/types/schemas/projects";
import { z } from "zod";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

export const getProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    ProjectService.listProjectsEnsuringOne(context.organizationId),
  );

/**
 * Cross-project portfolio using only free GSC requests and cached D1 audit,
 * rank-tracking, and analysis-run rows. No metered provider is touched.
 *
 * Paginated because the page size is a SUBREQUEST budget: each project on the
 * page costs one Search Console request, against the Workers Free plan's
 * 50-per-invocation ceiling that this path's D1 reads also draw from. See
 * `PORTFOLIO_PAGE_SIZE_MAX`.
 */
const portfolioPageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(PORTFOLIO_PAGE_SIZE_MAX)
    .default(PORTFOLIO_PAGE_SIZE_DEFAULT),
});

export const getProjectsPortfolio = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(portfolioPageSchema)
  .handler(async ({ data, context }) =>
    ProjectService.getPortfolio(context.organizationId, {
      page: data.page,
      pageSize: data.pageSize,
    }),
  );

export const createProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createProjectSchema)
  .handler(async ({ data, context }) =>
    ProjectService.createProject(context.organizationId, data),
  );

export const updateProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateProjectSchema)
  .handler(async ({ data, context }) =>
    ProjectService.updateProject(context.organizationId, data),
  );

export const archiveProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(archiveProjectSchema)
  .handler(async ({ data, context }) =>
    ProjectService.archiveProject(context.organizationId, data),
  );

export const getArchivedProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    ProjectService.listArchivedProjects(context.organizationId),
  );

export const restoreProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(restoreProjectSchema)
  .handler(async ({ data, context }) =>
    ProjectService.restoreProject(context.organizationId, data),
  );

export const getProjectAccess = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(projectScopedSchema)
  .handler(async ({ data, context }) => {
    return ProjectService.getProjectForOrganization(
      context.organizationId,
      data.projectId,
    );
  });
