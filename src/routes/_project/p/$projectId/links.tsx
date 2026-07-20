import { createFileRoute } from "@tanstack/react-router";
import { LinkOpportunitiesPage } from "@/client/features/link-insights/LinkOpportunitiesPage";

export const Route = createFileRoute("/_project/p/$projectId/links")({
  component: LinksRoute,
});

function LinksRoute() {
  const { projectId } = Route.useParams();
  return <LinkOpportunitiesPage projectId={projectId} />;
}
