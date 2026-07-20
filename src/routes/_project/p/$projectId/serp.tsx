import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SerpOverviewPage } from "@/client/features/serp/SerpOverviewPage";
import { serpSearchSchema } from "@/types/schemas/serp";

export const Route = createFileRoute("/_project/p/$projectId/serp")({
  validateSearch: serpSearchSchema,
  component: SerpRoute,
});

function SerpRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q = "", loc } = Route.useSearch();

  return (
    <SerpOverviewPage
      projectId={projectId}
      navigate={navigate}
      query={q}
      locationCode={loc}
    />
  );
}
