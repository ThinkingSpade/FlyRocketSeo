import { Link } from "@tanstack/react-router";
import { NextActionsCard } from "./NextActionsCard";
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
          <p className="mt-1 text-sm text-base-content/70">
            {domain ??
              "Add your website to build an evidence-backed SEO workflow."}
          </p>
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

      {/* Independent cards keep their own loading/error states and shared query
          keys. Prioritize first-party performance and decisions, not paid tools. */}
      <SearchPerformanceCard projectId={projectId} />
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <NextActionsCard projectId={projectId} />
          <RankChangesCard projectId={projectId} />
        </div>
        <div className="min-w-0 space-y-4">
          <GettingStartedCard projectId={projectId} />
          <SiteAuditCard projectId={projectId} />
        </div>
      </div>
      <RankTrackingCard projectId={projectId} />
      <ProjectKeywordsCard projectId={projectId} />
      {domain ? <BacklinksCard projectId={projectId} domain={domain} /> : null}
      <QuickActionsCard projectId={projectId} />
      {domain ? (
        <details className="app-disclosure rounded-xl border border-base-300 bg-base-100">
          <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium hover:bg-base-200">
            Run additional research
          </summary>
          <div className="p-3 pt-0">
            <AnalyzeProjectCard projectId={projectId} domain={domain} />
          </div>
        </details>
      ) : null}
    </AppPageShell>
  );
}
