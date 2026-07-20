import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageExplorerPage } from "@/client/features/page-explorer/PageExplorerPage";
import { pageExplorerSearchSchema } from "@/types/schemas/page-explorer";

export const Route = createFileRoute("/_project/p/$projectId/page")({
  validateSearch: pageExplorerSearchSchema,
  component: PageExplorerRoute,
});

function PageExplorerRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { u = "", loc } = Route.useSearch();

  return (
    <PageExplorerPage
      projectId={projectId}
      navigate={navigate}
      url={u}
      locationCode={loc}
    />
  );
}
