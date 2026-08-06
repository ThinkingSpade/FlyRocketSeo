import { createServerFn } from "@tanstack/react-start";
import { ProjectSubdomainService } from "@/server/features/projects/services/ProjectSubdomainService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  addProjectSubdomainSchema,
  discoverProjectSubdomainsSchema,
  listProjectSubdomainsSchema,
  removeProjectSubdomainsSchema,
  setProjectSubdomainsActiveSchema,
} from "@/types/schemas/project-subdomains";

export const getProjectSubdomains = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listProjectSubdomainsSchema)
  .handler(async ({ context }) =>
    ProjectSubdomainService.listSubdomains(
      context.organizationId,
      context.projectId,
    ),
  );

export const addProjectSubdomain = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(addProjectSubdomainSchema)
  .handler(async ({ data, context }) =>
    // `context.projectId` rather than `data.projectId`: the middleware resolved
    // it against this org's active projects, so it is the authorized value.
    ProjectSubdomainService.addSubdomain(context.organizationId, {
      ...data,
      projectId: context.projectId,
    }),
  );

export const removeProjectSubdomains = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(removeProjectSubdomainsSchema)
  .handler(async ({ data, context }) =>
    ProjectSubdomainService.removeSubdomains(context.organizationId, {
      ...data,
      projectId: context.projectId,
    }),
  );

export const setProjectSubdomainsActive = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setProjectSubdomainsActiveSchema)
  .handler(async ({ data, context }) =>
    ProjectSubdomainService.setSubdomainsActive(context.organizationId, {
      ...data,
      projectId: context.projectId,
    }),
  );

export const discoverProjectSubdomains = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(discoverProjectSubdomainsSchema)
  .handler(async ({ data, context }) =>
    ProjectSubdomainService.discoverSubdomains(
      context.organizationId,
      { ...data, projectId: context.projectId },
      context,
    ),
  );
