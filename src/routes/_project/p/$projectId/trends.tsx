import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TrendsPage } from "@/client/features/trends/TrendsPage";
import { trendsSearchSchema } from "@/types/schemas/trends";

export const Route = createFileRoute("/_project/p/$projectId/trends")({
  validateSearch: trendsSearchSchema,
  component: TrendsRoute,
});

function TrendsRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q = "" } = Route.useSearch();

  return <TrendsPage projectId={projectId} navigate={navigate} query={q} />;
}
