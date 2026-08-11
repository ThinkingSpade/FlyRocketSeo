import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TrendsPage } from "@/client/features/trends/TrendsPage";
import { trendsSearchSchema } from "@/types/schemas/trends";

export const Route = createFileRoute("/_project/p/$projectId/trends")({
  validateSearch: trendsSearchSchema,
  component: TrendsRoute,
});

function TrendsRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q = "" } = Route.useSearch();

  // `key={projectId}` is load-bearing, not tidiness. The router keeps this
  // component mounted across an in-place project switch, and TrendsPage now
  // owns the tab's ONE `useTargetAreaScope` -- whose `ready` flag gates the
  // only automatic paid call in this app. Neither `ready` nor `area` resets
  // on a prop change, so without this remount a switch from project A to
  // project B would leave A's confirmed area still reading "ready" while B's
  // one-shot paid run captured it: a permanently mis-targeted run with no
  // free re-fetch to correct it. It also resets the keyword field and the
  // restored run, both of which are per-project anyway.
  return (
    <TrendsPage
      key={projectId}
      projectId={projectId}
      navigate={navigate}
      query={q}
    />
  );
}
