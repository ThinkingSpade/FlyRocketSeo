import type { getProjectsPortfolio } from "@/serverFunctions/projects";

// Shape returned by the getProjects server function (a mapped project row).
export type ProjectSummary = {
  id: string;
  name: string;
  domain: string | null;
  createdAt: string;
};

export type PortfolioData = Awaited<ReturnType<typeof getProjectsPortfolio>>;
export type PortfolioProject = PortfolioData["projects"][number];
