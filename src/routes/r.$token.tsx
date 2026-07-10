import { createFileRoute } from "@tanstack/react-router";
import { PublicReportPage } from "@/client/features/report/PublicReportPage";

// Public shared-report viewer — intentionally OUTSIDE the authenticated
// layouts: possession of the token is the entire capability.
export const Route = createFileRoute("/r/$token")({
  component: PublicReportRoute,
});

function PublicReportRoute() {
  const { token } = Route.useParams();
  return <PublicReportPage token={token} />;
}
