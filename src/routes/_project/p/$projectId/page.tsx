import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageInvestigationPage } from "@/client/features/page-explorer/PageInvestigationPage";
import { pageExplorerSearchSchema } from "@/types/schemas/page-explorer";

export const Route = createFileRoute("/_project/p/$projectId/page")({
  validateSearch: pageExplorerSearchSchema,
  component: PageExplorerRoute,
});

function PageExplorerRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();

  return (
    <PageInvestigationPage
      projectId={projectId}
      navigate={navigate}
      search={search}
    />
  );
}
