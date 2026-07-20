import { createFileRoute } from "@tanstack/react-router";
import { CannibalizationPage } from "@/client/features/link-insights/CannibalizationPage";

export const Route = createFileRoute("/_project/p/$projectId/cannibalization")({
  component: CannibalizationRoute,
});

function CannibalizationRoute() {
  const { projectId } = Route.useParams();
  return <CannibalizationPage projectId={projectId} />;
}
