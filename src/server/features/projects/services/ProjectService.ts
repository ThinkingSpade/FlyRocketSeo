import {
  archiveProject,
  createProject,
  getProjectForOrganization,
  listArchivedProjects,
  listProjects,
  listProjectsEnsuringOne,
  restoreProject,
  updateProject,
} from "@/server/features/projects/services/projects";
import { getPortfolio } from "@/server/features/projects/services/portfolio";

export const ProjectService = {
  listProjects,
  listProjectsEnsuringOne,
  createProject,
  updateProject,
  archiveProject,
  restoreProject,
  listArchivedProjects,
  getProjectForOrganization,
  getPortfolio,
} as const;
