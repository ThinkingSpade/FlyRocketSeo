import { createFileRoute } from "@tanstack/react-router";
import { ClientReportPage } from "@/client/features/report/ClientReportPage";

export const Route = createFileRoute("/_project/p/$projectId/report")({
  component: ReportRoute,
});

function ReportRoute() {
  const { projectId } = Route.useParams();
  return <ClientReportPage projectId={projectId} />;
}
