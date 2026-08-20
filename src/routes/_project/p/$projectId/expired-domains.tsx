import { createFileRoute } from "@tanstack/react-router";
import { ExpiredDomainsPage } from "@/client/features/expired-domains/ExpiredDomainsPage";

export const Route = createFileRoute("/_project/p/$projectId/expired-domains")({
  component: ExpiredDomainsRoute,
});

function ExpiredDomainsRoute() {
  const { projectId } = Route.useParams();
  return <ExpiredDomainsPage projectId={projectId} />;
}
