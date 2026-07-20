import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TopicClustersPage } from "@/client/features/topic-clusters/TopicClustersPage";
import { topicClustersSearchSchema } from "@/types/schemas/topic-clusters";

export const Route = createFileRoute("/_project/p/$projectId/clusters")({
  validateSearch: topicClustersSearchSchema,
  component: ClustersRoute,
});

function ClustersRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q = "", loc } = Route.useSearch();

  return (
    <TopicClustersPage
      projectId={projectId}
      navigate={navigate}
      query={q}
      locationCode={loc}
    />
  );
}
