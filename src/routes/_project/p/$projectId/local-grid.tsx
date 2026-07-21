import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LocalRankGridPage } from "@/client/features/local-grid/LocalRankGridPage";
import { localGridSearchSchema } from "@/types/schemas/local-grid";

export const Route = createFileRoute("/_project/p/$projectId/local-grid")({
  validateSearch: localGridSearchSchema,
  component: LocalGridRoute,
});

function LocalGridRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q = "", lat, lng, r, g } = Route.useSearch();

  return (
    <LocalRankGridPage
      projectId={projectId}
      navigate={navigate}
      query={q}
      lat={lat}
      lng={lng}
      radius={r}
      gridSize={g}
    />
  );
}
