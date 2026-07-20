import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ContentOptimizerPage } from "@/client/features/content/ContentOptimizerPage";
import { contentSearchSchema } from "@/types/schemas/content";

export const Route = createFileRoute("/_project/p/$projectId/content")({
  validateSearch: contentSearchSchema,
  component: ContentRoute,
});

function ContentRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q = "", loc } = Route.useSearch();

  return (
    <ContentOptimizerPage
      projectId={projectId}
      navigate={navigate}
      query={q}
      locationCode={loc}
    />
  );
}
