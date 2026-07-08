import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CompetitorsPage } from "@/client/features/competitors/CompetitorsPage";
import { competitorsSearchSchema } from "@/types/schemas/competitors";

export const Route = createFileRoute("/_project/p/$projectId/competitors")({
  validateSearch: competitorsSearchSchema,
  component: CompetitorsRoute,
});

function CompetitorsRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const {
    target = "",
    competitor = "",
    tab = "competitors",
    mode = "missing",
    page = 1,
  } = Route.useSearch();

  return (
    <CompetitorsPage
      projectId={projectId}
      navigate={navigate}
      searchState={{ target, competitor, tab, mode, page }}
    />
  );
}
