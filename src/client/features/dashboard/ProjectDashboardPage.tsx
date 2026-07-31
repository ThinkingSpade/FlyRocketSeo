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
      {/* Only the pieces that genuinely need the project record wait for it.
       *
       * The whole dashboard used to sit behind `projectsQuery.isPending`, which
       * cost far more than it looks: a server-function round trip against this
       * Worker is ~4s of fixed per-invocation overhead (measured 2026-07-31 — a
       * 404 that runs no handler costs the same), so NOTHING below could even
       * begin fetching until 4s in. That turned independent queries into a
       * second wave and roughly doubled time-to-data.
       *
       * `projectId` comes from the route params, not from this query, so every
       * card keyed only on it can start immediately. Each already renders its
       * own skeleton and degrades independently, which is why removing the
       * page-level gate does not leave holes. */}
      {projectsQuery.isPending ? (
        <div className="flex flex-col gap-1">
          <div className="skeleton h-8 w-56" />
          <div className="skeleton h-4 w-40" />
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold">
            {project?.name ?? "Project overview"}
          </h1>
          <p className="text-sm text-base-content/70">
            {domain ?? "No domain set"}
          </p>
        </div>
      )}

      {/* Needs `domain`, so it legitimately waits — rendered in place rather
          than moved, to keep the layout from reflowing when it arrives. */}
      {projectsQuery.isPending ? (
        <div className="skeleton h-32 w-full" />
      ) : (
        <AnalyzeProjectCard projectId={projectId} domain={domain} />
      )}

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
        {projectsQuery.isPending ? (
          <div className="skeleton h-32 w-full" />
        ) : (
          <BacklinksCard projectId={projectId} domain={domain} />
        )}
      </div>
    </AppPageShell>
  );
}
