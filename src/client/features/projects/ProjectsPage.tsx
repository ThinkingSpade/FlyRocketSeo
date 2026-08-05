import * as React from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  MousePointerClick,
  Plus,
  Search,
} from "lucide-react";
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

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Headline figures for the portfolio.
 *
 * Only "Total projects" can be stated for the whole organization — it comes
 * from the server's own count. The other three are summed from the rows on
 * screen, and the portfolio is paged (the page size is a Search Console
 * subrequest budget, see PORTFOLIO_PAGE_SIZE_MAX), so once there is more than
 * one page they describe THIS PAGE and say so. Summing a page and labelling it
 * as the total would be a quietly wrong number on the most prominent row of
 * the screen.
 */
function PortfolioSummary({
  projects,
  totalCount,
  paginated,
}: {
  projects: PortfolioProject[];
  totalCount: number;
  paginated: boolean;
}) {
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

  const scope = paginated ? " (this page)" : "";
  const items = [
    {
      label: "Total projects",
      value: String(totalCount),
      icon: FolderKanban,
    },
    {
      label: `GSC connected${scope}`,
      value: String(summary.connected),
      icon: Search,
    },
    {
      label: `Clicks this period${scope}`,
      value: compactFormatter.format(Math.round(summary.clicks)),
      icon: MousePointerClick,
    },
    {
      label: `Projects with audit issues${scope}`,
      value: String(summary.auditIssues),
      icon: ClipboardCheck,
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
      <AlertCircle className="mx-auto size-5 text-base-content/40" />
      <h2 className="mt-2 font-medium">Portfolio could not be loaded</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-base-content/60">
        {getStandardErrorMessage(error)}
      </p>
      <button
        type="button"
        className="btn btn-outline btn-sm mt-4"
        onClick={onRetry}
      >
        Try again
      </button>
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

  const [page, setPage] = React.useState(1);

  const portfolioQuery = useQuery({
    queryKey: ["projects", "portfolio", page],
    queryFn: () => getProjectsPortfolio({ data: { page } }),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const projects = portfolioQuery.data?.projects ?? [];
  const pageSize = portfolioQuery.data?.pageSize ?? 1;
  const totalCount = portfolioQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="mt-1 text-sm text-base-content/60">
              Compare every project using free Search Console data and saved
              audit, ranking, and analysis history.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm shrink-0"
            onClick={() => setCreating(true)}
          >
            <Plus className="size-4" />
            New project
          </button>
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
            <PortfolioSummary
              projects={projects}
              totalCount={totalCount}
              paginated={totalPages > 1}
            />
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
                  <BarChart3 className="size-3.5 text-base-content/35" />
                  Free and cached data only
                </span>
              </div>
              <PortfolioTable
                projects={projects}
                currentProjectId={currentProjectId}
              />
              {totalPages > 1 ? (
                <PortfolioPagination
                  page={page}
                  totalPages={totalPages}
                  totalCount={totalCount}
                  busy={portfolioQuery.isFetching}
                  onPageChange={setPage}
                />
              ) : null}
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

/**
 * Paging for the portfolio.
 *
 * The page size is not a display preference — it is the Search Console
 * subrequest budget one request can spend (see PORTFOLIO_PAGE_SIZE_MAX), which
 * is why it is fixed by the server rather than offered as a control here.
 */
function PortfolioPagination({
  page,
  totalPages,
  totalCount,
  busy,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  busy: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-base-300 px-4 py-2">
      <span className="text-sm tabular-nums text-base-content/70">
        {totalCount.toLocaleString()} projects
      </span>
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-sm tabular-nums text-base-content/70">
          Page {page.toLocaleString()} of {totalPages.toLocaleString()}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square"
          disabled={page <= 1 || busy}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square"
          disabled={page >= totalPages || busy}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
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
            <button
              type="button"
              className="btn btn-ghost btn-sm shrink-0"
              onClick={() => restoreMutation.mutate(project.id)}
              disabled={restoreMutation.isPending}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
