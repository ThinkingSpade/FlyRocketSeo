import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  WarningCircle,
  ChartBar,
  ClipboardText,
  Kanban,
  CursorClick,
  Plus,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  getArchivedProjects,
  getProjectsPortfolio,
  restoreProject,
} from "@/serverFunctions/projects";
import { CreateProjectModal } from "@/client/features/projects/CreateProjectModal";
import {
  formatPortfolioDate,
  PortfolioTable,
} from "@/client/features/projects/PortfolioTable";
import type { PortfolioProject } from "@/client/features/projects/types";
import { getLastProjectId } from "@/client/lib/active-project";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { Button } from "@cloudflare/kumo/components/button";
import { useReveal } from "@/client/hooks/useReveal";

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function PortfolioSummary({ projects }: { projects: PortfolioProject[] }) {
  const summary = React.useMemo(() => {
    let connected = 0;
    let clicks = 0;
    let auditIssues = 0;
    for (const project of projects) {
      if (project.gsc.status !== "not_connected") connected += 1;
      if (project.gsc.status === "connected") {
        clicks += project.gsc.current.clicks;
      }
      if (project.audit && project.audit.issueCount > 0) auditIssues += 1;
    }
    return { connected, clicks, auditIssues };
  }, [projects]);

  const items = [
    {
      label: "Total projects",
      value: String(projects.length),
      icon: Kanban,
    },
    {
      label: "GSC connected",
      value: String(summary.connected),
      icon: MagnifyingGlass,
    },
    {
      label: "Clicks this period",
      value: compactFormatter.format(Math.round(summary.clicks)),
      icon: CursorClick,
    },
    {
      label: "Projects with audit issues",
      value: String(summary.auditIssues),
      icon: ClipboardText,
    },
  ];

  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-base-300 bg-base-300 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 bg-base-100 px-4 py-3"
        >
          <item.icon className="size-4 shrink-0 text-base-content/40" />
          <span className="min-w-0">
            <span className="block text-lg font-semibold tabular-nums">
              {item.value}
            </span>
            <span className="block truncate text-xs text-base-content/55">
              {item.label}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function PortfolioLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading portfolio">
      <div className="grid gap-px overflow-hidden rounded-lg border border-base-300 bg-base-300 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2 bg-base-100 px-4 py-3">
            <div className="skeleton h-5 w-16" />
            <div className="skeleton h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-base-300">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex gap-6 border-b border-base-300 p-4 last:border-b-0"
          >
            <div className="skeleton h-8 w-44" />
            <div className="skeleton h-8 w-40" />
            <div className="skeleton h-8 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-6 text-center">
      <WarningCircle className="mx-auto size-5 text-base-content/40" />
      <h2 className="mt-2 font-medium">Portfolio could not be loaded</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-base-content/60">
        {getStandardErrorMessage(error)}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  );
}

export function ProjectsPage() {
  const [creating, setCreating] = React.useState(false);
  const [currentProjectId, setCurrentProjectId] = React.useState<string | null>(
    null,
  );
  React.useEffect(() => {
    setCurrentProjectId(getLastProjectId());
  }, []);

  const portfolioQuery = useQuery({
    queryKey: ["projects", "portfolio"],
    queryFn: () => getProjectsPortfolio(),
    staleTime: 5 * 60 * 1000,
  });
  const projects = portfolioQuery.data?.projects ?? [];

  // Page entrance, staggered per section — the same treatment AppPageShell
  // gives every project page. These account pages predate it and hand-roll
  // their own frame, so without this they were the only pages that snapped in.
  const revealRef = useReveal({ stagger: true });

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div ref={revealRef} className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="mt-1 text-sm text-base-content/60">
              Compare every project using free Search Console data and saved
              audit, ranking, and analysis history.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="shrink-0"
            onClick={() => setCreating(true)}
          >
            <Plus className="size-4" />
            New project
          </Button>
        </div>

        {portfolioQuery.isPending ? (
          <PortfolioLoading />
        ) : portfolioQuery.isError ? (
          <PortfolioError
            error={portfolioQuery.error}
            onRetry={() => void portfolioQuery.refetch()}
          />
        ) : (
          <>
            <PortfolioSummary projects={projects} />
            <section className="space-y-3" aria-labelledby="projects-heading">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="projects-heading" className="font-semibold">
                    Projects
                  </h2>
                  <p className="text-xs text-base-content/50">
                    GSC compares{" "}
                    {formatPortfolioDate(portfolioQuery.data.range.startDate)}–{" "}
                    {formatPortfolioDate(portfolioQuery.data.range.endDate)}{" "}
                    with the previous period. Column headers sort the portfolio.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-base-content/45">
                  <ChartBar className="size-3.5 text-base-content/35" />
                  Free and cached data only
                </span>
              </div>
              <PortfolioTable
                projects={projects}
                currentProjectId={currentProjectId}
              />
            </section>
          </>
        )}

        <ArchivedProjects />
      </div>

      {creating ? (
        <CreateProjectModal onClose={() => setCreating(false)} />
      ) : null}
    </div>
  );
}

function ArchivedProjects() {
  const queryClient = useQueryClient();
  const archivedQuery = useQuery({
    queryKey: ["projects", "archived"],
    queryFn: () => getArchivedProjects(),
  });
  const archived = archivedQuery.data ?? [];

  const restoreMutation = useMutation({
    mutationFn: (projectId: string) =>
      restoreProject({ data: { archivedProjectId: projectId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project restored");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to restore project")),
  });

  if (archivedQuery.isPending) {
    return <div className="skeleton h-16 w-full rounded-lg" />;
  }
  if (archivedQuery.isError) {
    return (
      <p className="text-sm text-base-content/55">
        Archived projects could not be loaded.
      </p>
    );
  }
  if (archived.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">Archived</h2>
      <ul className="divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300">
        {archived.map((project) => (
          <li
            key={project.id}
            className="flex items-center justify-between gap-3 p-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-base-content/70">
                {project.name}
              </span>
              <span className="truncate text-xs text-base-content/50">
                {project.domain ?? "No domain set"}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => restoreMutation.mutate(project.id)}
              disabled={restoreMutation.isPending}
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
