import { createFileRoute } from "@tanstack/react-router";
import { ProjectsPage } from "@/client/features/projects/ProjectsPage";

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
});
