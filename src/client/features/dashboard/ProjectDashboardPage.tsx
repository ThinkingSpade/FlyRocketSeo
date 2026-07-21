import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";
import type { ProjectSummary } from "@/client/features/projects/types";
import { BacklinksCard } from "./BacklinksCard";
import { DashboardLoadingState } from "./DashboardLoadingState";
import { GettingStartedCard } from "./GettingStartedCard";
import { ProjectKeywordsCard } from "./ProjectKeywordsCard";
import { QuickActionsCard } from "./QuickActionsCard";
import { RankChangesCard } from "./RankChangesCard";
import { RankTrackingCard } from "./RankTrackingCard";
import { SearchPerformanceCard } from "./SearchPerformanceCard";
import { SiteAuditCard } from "./SiteAuditCard";

export function ProjectDashboardPage({ projectId }: { projectId: string }) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 60_000,
  });

  const project: ProjectSummary | undefined = projectsQuery.data?.find(
    (candidate) => candidate.id === projectId,
  );
  const domain = project?.domain ?? null;

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        {projectsQuery.isPending ? (
          <DashboardLoadingState />
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-semibold">
                {project?.name ?? "Project overview"}
              </h1>
              <p className="text-sm text-base-content/70">
                {domain ?? "No domain set"}
              </p>
            </div>

            {/* Each card owns its own query, so one failing source degrades
                just that card and never blanks the dashboard. */}
            <GettingStartedCard projectId={projectId} />
            <QuickActionsCard projectId={projectId} />
            <RankTrackingCard projectId={projectId} />
            <RankChangesCard projectId={projectId} />
            <SearchPerformanceCard projectId={projectId} />
            <ProjectKeywordsCard projectId={projectId} />
            <div className="grid gap-4 lg:grid-cols-2">
              <SiteAuditCard projectId={projectId} />
              <BacklinksCard projectId={projectId} domain={domain} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
