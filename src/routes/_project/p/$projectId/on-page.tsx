import { createFileRoute } from "@tanstack/react-router";
import { OnPageFixesPage } from "@/client/features/onpage/OnPageFixesPage";

export const Route = createFileRoute("/_project/p/$projectId/on-page")({
  component: OnPageRoute,
});

function OnPageRoute() {
  const { projectId } = Route.useParams();
  return <OnPageFixesPage projectId={projectId} />;
}
