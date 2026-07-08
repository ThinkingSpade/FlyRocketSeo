import { createFileRoute } from "@tanstack/react-router";
import { ProjectDashboardPage } from "@/client/features/dashboard/ProjectDashboardPage";

export const Route = createFileRoute("/_project/p/$projectId/")({
  component: ProjectDashboardRoute,
});

function ProjectDashboardRoute() {
  const { projectId } = Route.useParams();
  return <ProjectDashboardPage projectId={projectId} />;
}
