import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReportPage } from "@/client/features/report/ReportPage";
import { reportSearchSchema } from "@/types/schemas/report";

export const Route = createFileRoute("/_project/p/$projectId/report")({
  validateSearch: reportSearchSchema,
  component: ReportRoute,
});

function ReportRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { range = "30d" } = Route.useSearch();

  return (
    <ReportPage projectId={projectId} navigate={navigate} rangeKey={range} />
  );
}
