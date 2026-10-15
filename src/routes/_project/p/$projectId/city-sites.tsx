import { createFileRoute } from "@tanstack/react-router";
import { CitySitesPage } from "@/client/features/city-sites/CitySitesPage";

export const Route = createFileRoute("/_project/p/$projectId/city-sites")({
  component: CitySitesRoute,
});

function CitySitesRoute() {
  const { projectId } = Route.useParams();
  return <CitySitesPage projectId={projectId} />;
}
