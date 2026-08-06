import { z } from "zod";
import {
  MAX_SUBDOMAIN_HOST_LENGTH,
  MAX_SUBDOMAINS_PER_PROJECT,
  SUBDOMAIN_DISCOVERY_SOURCES,
} from "@/shared/project-subdomains";

const projectIdField = z.string().min(1);

/**
 * Bulk mutations are bounded by the per-project cap: the largest legitimate
 * selection is "every row this project could hold", and anything past that is a
 * malformed request rather than a big estate.
 */
const subdomainIdsField = z
  .array(z.string().min(1))
  .min(1, "Select at least one subdomain")
  .max(MAX_SUBDOMAINS_PER_PROJECT);

export const listProjectSubdomainsSchema = z.object({
  projectId: projectIdField,
});

export const addProjectSubdomainSchema = z.object({
  projectId: projectIdField,
  // Validated as a host (and confirmed to sit under the project's apex) in the
  // service, which is the only layer that knows what the project's domain is.
  host: z.string().trim().min(1).max(MAX_SUBDOMAIN_HOST_LENGTH),
});

export const removeProjectSubdomainsSchema = z.object({
  projectId: projectIdField,
  subdomainIds: subdomainIdsField,
});

export const setProjectSubdomainsActiveSchema = z.object({
  projectId: projectIdField,
  subdomainIds: subdomainIdsField,
  isActive: z.boolean(),
});

export const discoverProjectSubdomainsSchema = z.object({
  projectId: projectIdField,
  // Defaults to every source. The client sends an explicit list so a user who
  // wants only the free Search Console pass never triggers a metered call.
  sources: z
    .array(z.enum(SUBDOMAIN_DISCOVERY_SOURCES))
    .min(1)
    .default([...SUBDOMAIN_DISCOVERY_SOURCES]),
});

export type AddProjectSubdomainInput = z.infer<
  typeof addProjectSubdomainSchema
>;
export type RemoveProjectSubdomainsInput = z.infer<
  typeof removeProjectSubdomainsSchema
>;
export type SetProjectSubdomainsActiveInput = z.infer<
  typeof setProjectSubdomainsActiveSchema
>;
export type DiscoverProjectSubdomainsInput = z.infer<
  typeof discoverProjectSubdomainsSchema
>;
