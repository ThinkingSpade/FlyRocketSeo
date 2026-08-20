import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CaretUpDown, FolderSimpleUser } from "@phosphor-icons/react";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { getProjects } from "@/serverFunctions/projects";
import { setLastProjectId } from "@/client/lib/active-project";
import { ProjectFavicon } from "./ProjectFavicon";
import type { ProjectSummary } from "./types";

export function ProjectSwitcher({
  activeProjectId,
  onCloseDrawer,
}: {
  activeProjectId: string | null;
  // Mobile sidebar passes this so switching / navigating away also closes the
  // drawer overlay.
  onCloseDrawer?: () => void;
}) {
  const navigate = useNavigate();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const projects = projectsQuery.data ?? [];
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;

  const handleSelect = (project: ProjectSummary) => {
    // No explicit close any more — Kumo's menu closes itself on select. The
    // drawer callback is still ours, because that is a different overlay.
    onCloseDrawer?.();
    if (project.id === activeProjectId) return;
    setLastProjectId(project.id);
    void navigate({
      to: "/p/$projectId/keywords",
      params: { projectId: project.id },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <button
            type="button"
            aria-label="Switch project"
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-100 px-3 py-1.5 text-left transition-colors hover:border-base-content/25"
          >
            <span className="flex min-w-0 items-center gap-2">
              <ProjectFavicon
                domain={activeProject?.domain ?? null}
                className="size-6"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-base-content">
                  {activeProject?.name ?? "Select project"}
                </span>
                {activeProject?.domain ? (
                  <span className="truncate text-xs font-normal text-base-content/50">
                    {activeProject.domain}
                  </span>
                ) : null}
              </span>
            </span>
            <CaretUpDown className="size-3.5 shrink-0 text-base-content/40" />
          </button>
        }
      />

      {/* The menu portals out of the sidebar, so `w-full` no longer means the
          trigger's width. Base UI's positioner publishes the trigger width as
          --anchor-width; min-width rather than width so a long project name can
          still push the menu wider than the rail. */}
      <DropdownMenu.Content
        align="start"
        sideOffset={4}
        className="min-w-(--anchor-width)"
      >
        {projects.map((project) => (
          <DropdownMenu.Item
            key={project.id}
            // Kumo renders its own check for `selected`, so the hand-placed
            // one this used to carry would have doubled up.
            selected={project.id === activeProjectId}
            onClick={() => handleSelect(project)}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <ProjectFavicon domain={project.domain} className="size-5" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{project.name}</span>
                {project.domain ? (
                  <span className="truncate text-xs text-base-content/50">
                    {project.domain}
                  </span>
                ) : null}
              </span>
            </span>
          </DropdownMenu.Item>
        ))}

        {projects.length > 0 ? <DropdownMenu.Separator /> : null}

        <DropdownMenu.LinkItem
          icon={FolderSimpleUser}
          render={<Link to="/projects" onClick={onCloseDrawer} />}
        >
          Manage projects
        </DropdownMenu.LinkItem>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
