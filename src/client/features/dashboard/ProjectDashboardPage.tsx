import { Link } from "@tanstack/react-router";
import { InlineQueryError } from "@/client/components/InlineQueryError";
import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";
import type { ProjectSummary } from "@/client/features/projects/types";
import { AnalyzeProjectCard } from "./AnalyzeProjectCard";
import { BacklinksCard } from "./BacklinksCard";
import { GettingStartedCard } from "./GettingStartedCard";
import { ProjectKeywordsCard } from "./ProjectKeywordsCard";
import { QuickActionsCard } from "./QuickActionsCard";
import { RankChangesCard } from "./RankChangesCard";
import { RankTrackingCard } from "./RankTrackingCard";
import { SearchPerformanceCard } from "./SearchPerformanceCard";
import { SiteAuditCard } from "./SiteAuditCard";
import { AppPageShell } from "@/client/components/AppPageShell";
import { DashboardActions, DashboardChanges } from "./DashboardActionSections";
import { OpportunityWork } from "@/client/features/opportunities/OpportunityWork";

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
    <AppPageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium text-base-content/70">
            {project?.name ?? "Your project"}
          </p>
          <h1 className="text-2xl font-semibold">Overview</h1>
          {/* A null domain only means "no website" once projects have loaded;
              while pending or failed it is unknown, not absent. */}
          {projectsQuery.isPending ? (
            <div className="skeleton mt-1 h-4 w-40" />
          ) : projectsQuery.isSuccess ? (
            <p className="mt-1 text-sm text-base-content/70">
              {domain ??
                "Add your website to build an evidence-backed SEO workflow."}
            </p>
          ) : null}
        </div>
        <Link
          to="/p/$projectId/settings"
          params={{ projectId }}
          className="app-touch-target rounded-md border border-base-300 px-3 py-2 text-xs font-medium hover:bg-base-200"
        >
          Project settings
        </Link>
      </div>
      {projectsQuery.isError ? (
        <InlineQueryError
          message="Project details could not be loaded. Other sources remain available."
          onRetry={() => void projectsQuery.refetch()}
          retrying={projectsQuery.isFetching}
        />
      ) : null}

      <p className="text-sm text-base-content/60">
        Performance and actions · GSC web search, all countries and devices ·
        last 28 days. Each source keeps its own evidence and availability.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <SearchPerformanceCard projectId={projectId} />
        <DashboardActions projectId={projectId} domain={domain} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardChanges projectId={projectId} domain={domain} />
        <OpportunityWork projectId={projectId} compact />
      </div>
      <GettingStartedCard projectId={projectId} />
      <details className="rounded-xl border border-base-300 p-4">
        <summary className="cursor-pointer text-lg font-medium">
          Research tools and full reports
        </summary>
        <div className="mt-4 space-y-4">
          {/* Needs `domain`, so it legitimately waits — rendered in place rather
          than moved, to keep the layout from reflowing when it arrives. */}
          {projectsQuery.isPending ? (
            <div className="skeleton h-32 w-full" />
          ) : (
            <AnalyzeProjectCard projectId={projectId} domain={domain} />
          )}

          {/* Each card owns its own query, so one failing source degrades
          just that card and never blanks the dashboard. */}
          <QuickActionsCard projectId={projectId} />
          <RankTrackingCard projectId={projectId} />
          <RankChangesCard projectId={projectId} />
          <ProjectKeywordsCard projectId={projectId} />
          <div className="grid gap-4 lg:grid-cols-2">
            <SiteAuditCard projectId={projectId} />
            {projectsQuery.isPending ? (
              <div className="skeleton h-32 w-full" />
            ) : (
              <BacklinksCard projectId={projectId} domain={domain} />
            )}
          </div>
        </div>
      </details>
    </AppPageShell>
  );
}
