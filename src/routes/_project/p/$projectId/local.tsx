import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LocalSeoPage } from "@/client/features/local-seo/LocalSeoPage";
import { localSeoSearchSchema } from "@/types/schemas/local-seo";

export const Route = createFileRoute("/_project/p/$projectId/local")({
  validateSearch: localSeoSearchSchema,
  component: LocalSeoRoute,
});

function LocalSeoRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q = "" } = Route.useSearch();

  return <LocalSeoPage projectId={projectId} navigate={navigate} query={q} />;
}
